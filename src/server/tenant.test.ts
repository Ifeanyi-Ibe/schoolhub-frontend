import { describe, expect, it } from "vitest";
import { normalizeHost, resolveTenant } from "./tenant";

const prod = { baseDomain: "schoolhub.example", isProduction: true };
const dev = { baseDomain: "localhost", isProduction: false };

describe("resolveTenant", () => {
  it("resolves {slug}.{base} from the host, ignoring the port and case", () => {
    expect(resolveTenant({ ...dev, hostHeader: "Greenfield.localhost:3000" })).toEqual({
      slug: "greenfield",
      source: "host",
    });
    expect(resolveTenant({ ...prod, hostHeader: "greenfield.schoolhub.example" })?.slug).toBe(
      "greenfield",
    );
  });

  it("returns null for the apex, unrelated hosts, and multi-label subdomains", () => {
    expect(resolveTenant({ ...prod, hostHeader: "schoolhub.example" })).toBeNull();
    expect(resolveTenant({ ...prod, hostHeader: "evil.example.org" })).toBeNull();
    expect(resolveTenant({ ...prod, hostHeader: "a.b.schoolhub.example" })).toBeNull();
    expect(resolveTenant({ ...prod, hostHeader: "schoolhub.example.evil.com" })).toBeNull();
  });

  it("never treats infrastructure subdomains as schools", () => {
    for (const reserved of ["www", "api", "admin", "app", "platform"]) {
      expect(resolveTenant({ ...prod, hostHeader: `${reserved}.schoolhub.example` })).toBeNull();
    }
  });

  it("uses the dev fallback only outside production and only when the host names no school", () => {
    expect(
      resolveTenant({ ...dev, hostHeader: "localhost:3000", devFallbackSlug: "demo" }),
    ).toEqual({
      slug: "demo",
      source: "dev-fallback",
    });
    expect(
      resolveTenant({ ...prod, hostHeader: "schoolhub.example", devFallbackSlug: "demo" }),
    ).toBeNull();
  });

  it("refuses a host header that is missing or not a plain name", () => {
    expect(resolveTenant({ ...prod, hostHeader: null })).toBeNull();
    expect(resolveTenant({ ...prod, hostHeader: "[::1]:3000" })).toBeNull();
    expect(resolveTenant({ ...prod, hostHeader: "bad_label.schoolhub.example" })).toBeNull();
  });
});

describe("normalizeHost", () => {
  it("strips the port and lowercases", () => {
    expect(normalizeHost("Example.COM:8443")).toBe("example.com");
    expect(normalizeHost("   ")).toBeNull();
  });
});
