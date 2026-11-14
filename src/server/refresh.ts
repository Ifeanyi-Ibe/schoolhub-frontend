// Refresh-token rotation for one browser session (ADR 0003, ADR 0008 on the backend).
//
// Rotation is single-use: presenting an already-rotated refresh token after the backend's grace
// window revokes the whole session family. So every refresh for a session goes through ONE
// in-flight call, and a request that arrives just after rotation reuses the new tokens instead of
// replaying the old one.
//
// - In-process: one in-flight refresh per refresh token. Its result is kept for RESULT_TTL_MS,
//   which must stay well inside the backend's 10 second grace window.
// - Across instances: the backend answers 409 auth.refresh_in_flight while the winning request's
//   successor is unused. The contract says: wait Retry-After seconds, read the session the winner
//   stored, and retry with that newer refresh token. Nothing is revoked on that 409.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ApiClient } from "./api-client";
import type { SessionTokens } from "./session";

/** Cached results expire inside the backend's 10 s grace window (Auth:RefreshGraceSeconds). */
export const RESULT_TTL_MS = 8_000;
export const MAX_IN_FLIGHT_RETRIES = 3;
/** How many times we follow a newer refresh token within one call. */
const MAX_NEWER_TOKEN_HOPS = 2;
const DEFAULT_RETRY_AFTER_S = 1;
const MAX_RETRY_AFTER_S = 10;
const REFRESH_TIMEOUT_MS = 10_000;

export type RefreshOutcome =
  { ok: true; tokens: SessionTokens } | { ok: false; reason: "invalid" | "unavailable" };

export interface RefreshContext {
  api: ApiClient;
  tenantSlug: string | null;
  clientIp: string | null;
  inbound: Headers;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  /**
   * The session cookies as this request sees them. A request holds a snapshot, so this only
   * changes in a later request, after the winning request has set its cookies in the browser.
   */
  readCurrentSession: () => { accessToken?: string | undefined; refreshToken?: string | undefined };
}

const loginResponse = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.coerce.number().int().positive(),
});

const problemBody = z.object({ code: z.string().optional() }).passthrough();

interface InFlight {
  promise: Promise<RefreshOutcome>;
  settled: { at: number | null };
}

const inflight = new Map<string, InFlight>();

function keyFor(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

/** Test helper. */
export function resetRefreshStateForTests(): void {
  inflight.clear();
}

/** Retry-After in whole seconds. Missing or unusable values fall back to the contract's 1 s. */
export function retryAfterSeconds(header: string | null): number {
  const n = header === null ? Number.NaN : Number(header.trim());
  return Number.isInteger(n) && n >= 0 && n <= MAX_RETRY_AFTER_S ? n : DEFAULT_RETRY_AFTER_S;
}

/**
 * Rotate the session's refresh token. Concurrent callers, and callers that arrive within
 * RESULT_TTL_MS of a settled rotation, share one result.
 */
export function refreshSession(
  refreshToken: string,
  ctx: RefreshContext,
  hop = 0,
): Promise<RefreshOutcome> {
  const key = keyFor(refreshToken);
  const existing = inflight.get(key);
  if (
    existing &&
    (existing.settled.at === null || ctx.now() - existing.settled.at < RESULT_TTL_MS)
  ) {
    return existing.promise;
  }
  const settled: { at: number | null } = { at: null };
  const promise = runRefresh(refreshToken, ctx, hop).finally(() => {
    settled.at = ctx.now();
  });
  inflight.set(key, { promise, settled });
  return promise;
}

async function runRefresh(
  refreshToken: string,
  ctx: RefreshContext,
  hop: number,
): Promise<RefreshOutcome> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await ctx.api.call({
        method: "POST",
        path: "api/v1/auth/refresh",
        inbound: ctx.inbound,
        body: JSON.stringify({ refreshToken }),
        tenantSlug: ctx.tenantSlug,
        clientIp: ctx.clientIp,
        timeoutMs: REFRESH_TIMEOUT_MS,
      });
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    if (res.ok) {
      const parsed = loginResponse.safeParse(await readJson(res));
      if (!parsed.success) return { ok: false, reason: "unavailable" };
      const { accessToken, refreshToken: rotated, expiresIn } = parsed.data;
      return { ok: true, tokens: { accessToken, refreshToken: rotated, expiresIn } };
    }

    if (res.status === 409) {
      const body = problemBody.safeParse(await readJson(res));
      if (!body.success || body.data.code !== "auth.refresh_in_flight") {
        return { ok: false, reason: "unavailable" };
      }
      if (attempt >= MAX_IN_FLIGHT_RETRIES) return { ok: false, reason: "unavailable" };
      // Wait as the backend asks (Retry-After, plus a little jitter so retries do not line up).
      await ctx.sleep(
        retryAfterSeconds(res.headers.get("retry-after")) * 1000 + Math.floor(ctx.random() * 200),
      );
      // Retry with the newer refresh token the winning request stored, never the one we used.
      const newer = ctx.readCurrentSession().refreshToken;
      if (newer && newer !== refreshToken && hop < MAX_NEWER_TOKEN_HOPS) {
        return refreshSession(newer, ctx, hop + 1);
      }
      continue;
    }

    if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unavailable" };
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
