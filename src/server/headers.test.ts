import { describe, expect, it } from "vitest";
import { buildDownstreamHeaders, buildUpstreamHeaders, sanitizeUserAgent } from "./headers";

describe("buildUpstreamHeaders", () => {
  it("forwards only allowlisted headers and adds the BFF's own identity headers", () => {
    const inbound = new Headers({
      accept: "application/json",
      "content-type": "application/json",
      "idempotency-key": "k-0123456789",
      cookie: "sh_at=secret",
      authorization: "Bearer attacker",
      "x-tenant": "victim-school",
      "x-forwarded-for": "9.9.9.9",
      "x-forwarded-host": "evil.example",
      "user-agent": "Mozilla/5.0",
    });
    const out = buildUpstreamHeaders({
      inbound,
      bffKey: "bff-key-value-1234",
      tenantSlug: "greenfield",
      clientIp: "203.0.113.9",
      accessToken: "real-token",
    });
    expect(out.get("accept")).toBe("application/json");
    expect(out.get("idempotency-key")).toBe("k-0123456789");
    expect(out.get("cookie")).toBeNull();
    expect(out.get("x-forwarded-host")).toBeNull();
    expect(out.get("x-bff-key")).toBe("bff-key-value-1234");
    expect(out.get("x-tenant")).toBe("greenfield");
    expect(out.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(out.get("x-client-user-agent")).toBe("Mozilla/5.0");
    expect(out.get("authorization")).toBe("Bearer real-token");
  });

  it("never sends an attacker-supplied X-Tenant or X-Forwarded-For when we have none of our own", () => {
    const out = buildUpstreamHeaders({
      inbound: new Headers({ "x-tenant": "victim", "x-forwarded-for": "9.9.9.9" }),
      bffKey: "bff-key-value-1234",
      tenantSlug: null,
      clientIp: null,
    });
    expect(out.get("x-tenant")).toBeNull();
    expect(out.get("x-forwarded-for")).toBeNull();
    expect(out.get("authorization")).toBeNull();
  });
});

describe("content-length", () => {
  it("is never forwarded, because a re-serialised body changes length", () => {
    const out = buildUpstreamHeaders({
      inbound: new Headers({ "content-type": "application/json", "content-length": "16" }),
      bffKey: "bff-key-value-1234567890abcdef",
      tenantSlug: null,
      clientIp: null,
    });
    expect(out.get("content-length")).toBeNull();
    expect(out.get("content-type")).toBe("application/json");
  });
});

describe("buildDownstreamHeaders", () => {
  it("relays only allowlisted response headers and forces no-store", () => {
    const upstream = new Headers({
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="r.pdf"',
      "set-cookie": "session=stolen; Path=/",
      "cache-control": "public, max-age=600",
      "x-internal-debug": "stack trace",
    });
    const out = buildDownstreamHeaders(upstream);
    expect(out.get("content-type")).toBe("application/pdf");
    expect(out.get("set-cookie")).toBeNull();
    expect(out.get("x-internal-debug")).toBeNull();
    expect(out.get("cache-control")).toBe("no-store");
  });
});

describe("sanitizeUserAgent", () => {
  it("removes control characters and caps the length", () => {
    expect(sanitizeUserAgent("abc\r\nX-Injected: 1")).toBe("abcX-Injected: 1");
    expect(sanitizeUserAgent("a".repeat(500))).toHaveLength(256);
    expect(sanitizeUserAgent("   ")).toBeNull();
  });
});
