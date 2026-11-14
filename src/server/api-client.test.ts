import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

describe("createApiClient", () => {
  it("sends a JSON content type with a serialised body, even when the browser sent none", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const api = createApiClient(
      { apiBaseUrl: "http://api.test", bffKey: "k".repeat(32) },
      fetchImpl as unknown as typeof fetch,
    );
    await api.call({
      method: "POST",
      path: "api/v1/auth/refresh",
      inbound: new Headers({ accept: "application/json" }),
      body: JSON.stringify({ refreshToken: "x" }),
      tenantSlug: "demo",
      clientIp: null,
      timeoutMs: 1000,
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("keeps the browser's content type when it sent one", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const api = createApiClient(
      { apiBaseUrl: "http://api.test", bffKey: "k".repeat(32) },
      fetchImpl as unknown as typeof fetch,
    );
    await api.call({
      method: "POST",
      path: "api/v1/x",
      inbound: new Headers({ "content-type": "application/json; charset=utf-8" }),
      body: "{}",
      tenantSlug: null,
      clientIp: null,
      timeoutMs: 1000,
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("content-type")).toBe("application/json; charset=utf-8");
  });
});
