import { describe, expect, it } from "vitest";
import { buildCsp, config } from "./proxy";

describe("buildCsp", () => {
  const prod = buildCsp("abc123", false);

  it("allows scripts only with the per-request nonce, and never inline without it", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toContain("'unsafe-inline'; script");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("forbids framing, plugins and foreign form targets", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("base-uri 'self'");
  });

  it("allows eval only in development, for React's debugging", () => {
    expect(buildCsp("n", true)).toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(prod).not.toContain("unsafe-eval");
  });

  it("upgrades insecure requests in production only", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("proxy matcher", () => {
  // The matcher source is a path pattern that Next compiles; the negative lookahead is plain RegExp.
  const matches = (path: string) => new RegExp(`^${config.matcher[0]!.source}$`).test(path);

  it("leaves the static offline and unsupported-browser pages without a CSP nonce", () => {
    expect(matches("/offline.html")).toBe(false);
    expect(matches("/unsupported.html")).toBe(false);
    expect(matches("/browser-check.js")).toBe(false);
  });

  it("applies the CSP to pages and not to the BFF or build assets", () => {
    expect(matches("/login")).toBe(true);
    expect(matches("/api/bff/health")).toBe(false);
    expect(matches("/_next/static/chunks/x.js")).toBe(false);
  });
});
