import { describe, expect, it } from "vitest";
import { buildCsp } from "./proxy";

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
