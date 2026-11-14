// Shared fakes for BFF tests. No network, no real clock.
import type { ApiClient, UpstreamCall } from "./api-client";

export const NOW = 1_900_000_000_000;

export function jwtWithExp(expMs: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export interface FakeApi extends ApiClient {
  calls: UpstreamCall[];
}

/** A fake API whose behaviour is decided per call by `respond`. */
export function fakeApi(respond: (call: UpstreamCall) => Response | Promise<Response>): FakeApi {
  const calls: UpstreamCall[] = [];
  return {
    calls,
    async call(call) {
      calls.push(call);
      return respond(call);
    },
  };
}
