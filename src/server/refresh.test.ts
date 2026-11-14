import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_IN_FLIGHT_RETRIES,
  refreshSession,
  resultTtlMsForGrace,
  resetRefreshStateForTests,
  retryAfterSeconds,
  type RefreshContext,
} from "./refresh";
import { NOW, fakeApi, json } from "./test-helpers";

const okBody = { accessToken: "new.access.jwt", refreshToken: "rotated-2", expiresIn: 900 };
const inFlight = () =>
  new Response(JSON.stringify({ code: "auth.refresh_in_flight" }), {
    status: 409,
    headers: { "Content-Type": "application/problem+json", "Retry-After": "1" },
  });

function ctx(overrides: Partial<RefreshContext> & { api: RefreshContext["api"] }) {
  const clock = { t: NOW };
  const sleeps: number[] = [];
  const base: RefreshContext = {
    resultTtlMs: resultTtlMsForGrace(10),
    tenantSlug: "greenfield",
    clientIp: "203.0.113.9",
    inbound: new Headers({ "user-agent": "test" }),
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    readCurrentSession: () => ({}),
    ...overrides,
  };
  return { context: base, clock, sleeps };
}

beforeEach(() => resetRefreshStateForTests());

describe("refreshSession", () => {
  it("rotates the refresh token and returns the new tokens", async () => {
    const api = fakeApi(() => json(200, okBody));
    const { context } = ctx({ api });
    const out = await refreshSession("rotated-1", context);
    expect(out).toEqual({
      ok: true,
      tokens: { accessToken: "new.access.jwt", refreshToken: "rotated-2", expiresIn: 900 },
    });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({
      method: "POST",
      path: "api/v1/auth/refresh",
      tenantSlug: "greenfield",
    });
    expect(api.calls[0]?.accessToken).toBeUndefined();
    expect(JSON.parse(api.calls[0]?.body as string)).toEqual({ refreshToken: "rotated-1" });
  });

  it("makes one upstream call for concurrent callers with the same refresh token", async () => {
    let release: (r: Response) => void = () => undefined;
    const api = fakeApi(() => new Promise<Response>((resolve) => (release = resolve)));
    const { context } = ctx({ api });
    const a = refreshSession("same-token", context);
    const b = refreshSession("same-token", context);
    release(json(200, okBody));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(api.calls).toHaveLength(1);
  });

  it("keeps the cached result inside the configured grace window, minus a safety margin", () => {
    for (const grace of [3, 5, 10, 30]) {
      expect(resultTtlMsForGrace(grace)).toBeLessThan(grace * 1000);
    }
    expect(resultTtlMsForGrace(10)).toBe(8000);
    expect(resultTtlMsForGrace(5)).toBe(3000);
    expect(resultTtlMsForGrace(3)).toBe(1000);
  });

  it("reuses a settled result within the TTL, then refreshes again after it", async () => {
    const api = fakeApi(() => json(200, okBody));
    const { context, clock } = ctx({ api });
    await refreshSession("tok", context);
    clock.t += resultTtlMsForGrace(10) - 1;
    await refreshSession("tok", context);
    expect(api.calls).toHaveLength(1);
    clock.t += 2;
    await refreshSession("tok", context);
    expect(api.calls).toHaveLength(2);
  });

  it("on 409, waits Retry-After seconds plus jitter, then retries", async () => {
    let n = 0;
    const api = fakeApi(() => {
      n += 1;
      return n === 1 ? inFlight() : json(200, okBody);
    });
    const { context, sleeps } = ctx({ api, readCurrentSession: () => ({ refreshToken: "tok" }) });
    const out = await refreshSession("tok", context);
    expect(out.ok).toBe(true);
    expect(api.calls).toHaveLength(2);
    // Retry-After: 1 second, plus floor(0.5 * 200) = 100 ms of jitter.
    expect(sleeps).toEqual([1100]);
  });

  it("retries with the newer refresh token that the winning request stored, never the old one", async () => {
    let n = 0;
    const api = fakeApi(() => {
      n += 1;
      return n === 1 ? inFlight() : json(200, okBody);
    });
    const { context } = ctx({
      api,
      readCurrentSession: () => ({
        accessToken: jwtFor(NOW + 900_000),
        refreshToken: "successor-1",
      }),
    });
    const out = await refreshSession("old-token", context);
    expect(out.ok).toBe(true);
    expect(JSON.parse(api.calls[1]?.body as string)).toEqual({ refreshToken: "successor-1" });
  });

  it("does not follow an unchanged cookie: it keeps waiting, then gives up", async () => {
    const api = fakeApi(() => inFlight());
    const { context } = ctx({ api, readCurrentSession: () => ({ refreshToken: "old-token" }) });
    const out = await refreshSession("old-token", context);
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(api.calls).toHaveLength(MAX_IN_FLIGHT_RETRIES + 1);
    expect(api.calls.every((c) => JSON.parse(c.body as string).refreshToken === "old-token")).toBe(
      true,
    );
  });

  it("gives up after the bounded number of 409 retries", async () => {
    const api = fakeApi(() => inFlight());
    const { context } = ctx({ api });
    const out = await refreshSession("tok", context);
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(api.calls).toHaveLength(MAX_IN_FLIGHT_RETRIES + 1);
  });

  it("ignores a 409 with a different code (it is not the grace case)", async () => {
    const api = fakeApi(() => json(409, { code: "concurrency.conflict" }));
    const { context } = ctx({ api });
    expect(await refreshSession("tok", context)).toEqual({ ok: false, reason: "unavailable" });
    expect(api.calls).toHaveLength(1);
  });

  it("treats 401 and 403 as an invalid session without retrying", async () => {
    const api = fakeApi(() => json(401, { code: "auth.token_invalid" }));
    const { context } = ctx({ api });
    expect(await refreshSession("bad", context)).toEqual({ ok: false, reason: "invalid" });
    expect(api.calls).toHaveLength(1);
  });

  it("reports a 5xx or a network failure as unavailable, not as a logout", async () => {
    const { context: c1 } = ctx({ api: fakeApi(() => json(503, {})) });
    expect(await refreshSession("x", c1)).toEqual({ ok: false, reason: "unavailable" });
    const { context: c2 } = ctx({
      api: { call: async () => Promise.reject(new TypeError("fetch failed")) },
    });
    expect(await refreshSession("y", c2)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects a 200 whose body is not a login response", async () => {
    const { context } = ctx({ api: fakeApi(() => json(200, { nope: true })) });
    expect(await refreshSession("z", context)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("retryAfterSeconds", () => {
  it("reads delta-seconds and falls back to 1 for anything unusable", () => {
    expect(retryAfterSeconds("3")).toBe(3);
    expect(retryAfterSeconds("0")).toBe(0);
    expect(retryAfterSeconds(null)).toBe(1);
    expect(retryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBe(1);
    expect(retryAfterSeconds("3600")).toBe(1);
  });
});

function jwtFor(expMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString(
    "base64url",
  );
  return `h.${payload}.s`;
}
