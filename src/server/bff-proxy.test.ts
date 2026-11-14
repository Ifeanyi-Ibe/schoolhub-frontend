import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleDownload,
  handleProxy,
  parseAbsoluteDownload,
  parseDownloadRequest,
  sanitizeDisposition,
  type BffDeps,
} from "./bff-proxy";
import { resetRefreshStateForTests } from "./refresh";
import { NOW, fakeApi, jwtWithExp, json } from "./test-helpers";
import type { UpstreamCall } from "./api-client";

const APP = "https://schoolhub.example";
const HOST = "greenfield.schoolhub.example";

function depsWith(api: ReturnType<typeof fakeApi>, overrides: Partial<BffDeps> = {}): BffDeps {
  return {
    env: {
      APP_BASE_DOMAIN: "schoolhub.example",
      APP_ORIGIN: APP,
      TRUSTED_PROXY_COUNT: 1,
      DEV_TENANT_SLUG: undefined,
      NODE_ENV: "production",
      DOWNLOAD_ALLOWED_HOSTS: ["files.schoolhub.example"],
    },
    api,
    fetchExternal: vi.fn(
      async () => new Response("pdf-bytes", { status: 200 }),
    ) as unknown as typeof fetch,
    now: () => NOW,
    sleep: async () => undefined,
    random: () => 0.5,
    logger: () => undefined,
    ...overrides,
  };
}

function request(
  path: string,
  init: RequestInit & { cookie?: string; headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers({ host: HOST, ...(init.headers ?? {}) });
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`${APP}${path}`, { ...init, headers });
}

const fresh = jwtWithExp(NOW + 10 * 60_000);
const nearExpiry = jwtWithExp(NOW + 5_000);
const SEGMENTS = (p: string) => p.split("/").filter(Boolean);

beforeEach(() => resetRefreshStateForTests());

describe("handleProxy: forwarding", () => {
  it("forwards an anonymous GET with the BFF key and the host's tenant, and no credentials", async () => {
    const api = fakeApi(() => json(200, { ok: true }, { "set-cookie": "leak=1" }));
    const res = await handleProxy(
      request("/api/bff/api/v1/students?page=2", { headers: { "x-tenant": "victim" } }),
      ["api", "v1", "students"],
      depsWith(api),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    const call = api.calls[0] as UpstreamCall;
    expect(call.path).toBe("api/v1/students");
    expect(call.search).toBe("?page=2");
    expect(call.tenantSlug).toBe("greenfield");
    expect(call.clientIp).toBeNull(); // no X-Forwarded-For from our proxy on this request
    expect(call.accessToken).toBeUndefined();
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses the client IP appended by our own proxy and ignores spoofed entries", async () => {
    const api = fakeApi(() => json(200, {}));
    await handleProxy(
      request("/api/bff/api/v1/x", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" } }),
      ["api", "v1", "x"],
      depsWith(api),
    );
    expect(api.calls[0]?.clientIp).toBe("203.0.113.9");
  });

  it("refuses paths outside api/v1 without calling the API", async () => {
    const api = fakeApi(() => json(200, {}));
    const res = await handleProxy(request("/api/bff/admin/x"), ["admin", "x"], depsWith(api));
    expect(res.status).toBe(404);
    expect(api.calls).toHaveLength(0);
  });

  it("refuses a cross-site mutation before anything else happens", async () => {
    const api = fakeApi(() => json(200, {}));
    const res = await handleProxy(
      request("/api/bff/api/v1/students", {
        method: "POST",
        body: "{}",
        headers: { origin: "https://evil.example" },
      }),
      SEGMENTS("/api/v1/students"),
      depsWith(api),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("bff.csrf_header_missing");
    expect(api.calls).toHaveLength(0);
  });

  it("sends the access token from the cookie, never the refresh token", async () => {
    const api = fakeApi(() => json(200, {}));
    await handleProxy(
      request("/api/bff/api/v1/me", { cookie: `sh_at=${fresh}; sh_rt=refresh-1` }),
      ["api", "v1", "me"],
      depsWith(api),
    );
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.accessToken).toBe(fresh);
  });
});

describe("handleProxy: session refresh", () => {
  it("refreshes a near-expiry access token first and sets the rotated cookies on the response", async () => {
    const rotated = {
      accessToken: jwtWithExp(NOW + 15 * 60_000),
      refreshToken: "refresh-2",
      expiresIn: 900,
    };
    const api = fakeApi((call) =>
      call.path === "api/v1/auth/refresh" ? json(200, rotated) : json(200, { me: 1 }),
    );
    const res = await handleProxy(
      request("/api/bff/api/v1/me", { cookie: `sh_at=${nearExpiry}; sh_rt=refresh-1` }),
      ["api", "v1", "me"],
      depsWith(api),
    );
    expect(api.calls.map((c) => c.path)).toEqual(["api/v1/auth/refresh", "api/v1/me"]);
    expect(api.calls[1]?.accessToken).toBe(rotated.accessToken);
    const cookies = res.headers.getSetCookie();
    expect(
      cookies.some((c) => c.startsWith(`sh_at=${rotated.accessToken}`) && c.includes("Secure")),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith("sh_rt=refresh-2"))).toBe(true);
  });

  it("on 401, refreshes once, retries the call, and returns the retried response", async () => {
    const rotated = {
      accessToken: jwtWithExp(NOW + 15 * 60_000),
      refreshToken: "refresh-2",
      expiresIn: 900,
    };
    let meCalls = 0;
    const api = fakeApi((call) => {
      if (call.path === "api/v1/auth/refresh") return json(200, rotated);
      meCalls += 1;
      return meCalls === 1 ? json(401, { code: "auth.token_invalid" }) : json(200, { me: 2 });
    });
    const res = await handleProxy(
      request("/api/bff/api/v1/me", { cookie: `sh_at=${fresh}; sh_rt=refresh-1` }),
      ["api", "v1", "me"],
      depsWith(api),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ me: 2 });
    expect(res.headers.getSetCookie().length).toBe(2);
  });

  it("clears the session and relays 401 when the refresh token is no longer valid", async () => {
    const api = fakeApi((call) =>
      call.path === "api/v1/auth/refresh"
        ? json(401, {})
        : json(401, { code: "auth.token_invalid" }),
    );
    const res = await handleProxy(
      request("/api/bff/api/v1/me", { cookie: `sh_at=${fresh}; sh_rt=dead` }),
      ["api", "v1", "me"],
      depsWith(api),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("bff.session_ended");
    expect(api.calls.filter((c) => c.path === "api/v1/me")).toHaveLength(1);
    const cookies = res.headers.getSetCookie();
    expect(cookies.every((c) => c.includes("Max-Age=0"))).toBe(true);
    expect(cookies).toHaveLength(2);
  });

  it("answers 503 (keeping the cookies) when the session cannot be refreshed right now", async () => {
    const api = fakeApi((call) =>
      call.path === "api/v1/auth/refresh" ? json(503, {}) : json(200, {}),
    );
    const res = await handleProxy(
      request("/api/bff/api/v1/me", { cookie: `sh_at=${nearExpiry}; sh_rt=refresh-1` }),
      ["api", "v1", "me"],
      depsWith(api),
    );
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe("handleProxy: upstream failures", () => {
  it("returns 504 on a timeout and 502 when the API is unreachable", async () => {
    const timeout = fakeApi(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(
      (await handleProxy(request("/api/bff/api/v1/x"), ["api", "v1", "x"], depsWith(timeout)))
        .status,
    ).toBe(504);
    const down = fakeApi(() => {
      throw new TypeError("fetch failed");
    });
    expect(
      (await handleProxy(request("/api/bff/api/v1/x"), ["api", "v1", "x"], depsWith(down))).status,
    ).toBe(502);
  });

  it("relays a 429 with Retry-After", async () => {
    const api = fakeApi(() => json(429, { title: "Slow down" }, { "retry-after": "12" }));
    const res = await handleProxy(request("/api/bff/api/v1/x"), ["api", "v1", "x"], depsWith(api));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  it("relays a 402 billing.suspended problem body unchanged", async () => {
    const body = { title: "Suspended", code: "billing.suspended" };
    const api = fakeApi(() => json(402, body));
    const res = await handleProxy(
      request("/api/bff/api/v1/students", {
        method: "POST",
        body: "{}",
        headers: { "x-schoolhub-request": "1", origin: APP },
      }),
      ["api", "v1", "students"],
      depsWith(api),
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual(body);
  });
});

describe("handleDownload", () => {
  it("streams a relative file with the session and sets Content-Disposition and no-store", async () => {
    const api = fakeApi(
      () =>
        new Response("%PDF-1.7", {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'inline; filename="receipt-42.pdf"',
          },
        }),
    );
    const res = await handleDownload(
      request("/api/bff/download", {
        method: "POST",
        body: "{}",
        headers: { "x-schoolhub-request": "1", origin: APP },
      }),
      { path: "api/v1/payments/9/receipt" },
      depsWith(api),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="receipt-42.pdf"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("%PDF-1.7");
  });

  it("fetches an allow-listed absolute URL with no credentials and no redirects", async () => {
    const api = fakeApi(() => json(500, {}));
    const fetchExternal = vi.fn(
      async () => new Response("bytes", { status: 200, headers: { "content-type": "text/csv" } }),
    );
    const res = await handleDownload(
      request("/api/bff/download", {
        method: "POST",
        body: "{}",
        headers: { "x-schoolhub-request": "1", origin: APP },
      }),
      { url: "https://files.schoolhub.example/exports/a.csv?X-Amz-Signature=abc" },
      depsWith(api, { fetchExternal: fetchExternal as unknown as typeof fetch }),
    );
    expect(res.status).toBe(200);
    expect(api.calls).toHaveLength(0);
    const [, init] = fetchExternal.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("manual");
    const sent = new Headers(init.headers);
    expect(sent.get("x-bff-key")).toBeNull();
    expect(sent.get("authorization")).toBeNull();
  });

  it("refuses an absolute URL on a host outside the allow-list, without fetching it", async () => {
    const fetchExternal = vi.fn();
    const res = await handleDownload(
      request("/api/bff/download", {
        method: "POST",
        body: "{}",
        headers: { "x-schoolhub-request": "1", origin: APP },
      }),
      { url: "http://169.254.169.254/latest/meta-data" },
      depsWith(
        fakeApi(() => json(200, {})),
        { fetchExternal: fetchExternal as unknown as typeof fetch },
      ),
    );
    expect(res.status).toBe(400);
    expect(fetchExternal).not.toHaveBeenCalled();
  });
});

describe("download helpers", () => {
  it("validates exactly one of path or url", () => {
    expect(parseDownloadRequest({ path: "api/v1/x" })).toEqual({ path: "api/v1/x" });
    expect(parseDownloadRequest({ url: "https://files.schoolhub.example/a" })).toEqual({
      url: "https://files.schoolhub.example/a",
    });
    expect(parseDownloadRequest({ path: "a", url: "b" })).toBeNull();
    expect(parseDownloadRequest({})).toBeNull();
    expect(parseDownloadRequest("text")).toBeNull();
  });

  it("allows https (and http only outside production) to listed hosts, and no embedded credentials", () => {
    const hosts = ["files.schoolhub.example"];
    expect(
      parseAbsoluteDownload("https://files.schoolhub.example/a", hosts, "production"),
    ).not.toBeNull();
    expect(
      parseAbsoluteDownload("http://files.schoolhub.example/a", hosts, "production"),
    ).toBeNull();
    expect(
      parseAbsoluteDownload("http://files.schoolhub.example/a", hosts, "development"),
    ).not.toBeNull();
    expect(
      parseAbsoluteDownload("https://user:pw@files.schoolhub.example/a", hosts, "production"),
    ).toBeNull();
    expect(parseAbsoluteDownload("https://evil.example/a", hosts, "production")).toBeNull();
    expect(parseAbsoluteDownload("not a url", hosts, "production")).toBeNull();
  });

  it("keeps a safe filename and replaces anything else", () => {
    expect(sanitizeDisposition('inline; filename="report card.pdf"')).toBe(
      'attachment; filename="report card.pdf"',
    );
    expect(sanitizeDisposition('attachment; filename="../../etc/passwd"')).toBe(
      'attachment; filename=".._.._etc_passwd"',
    );
    expect(sanitizeDisposition(null)).toBe('attachment; filename="download"');
  });
});
