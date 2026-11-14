import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor } from "./client-ip";

describe("clientIpFromForwardedFor", () => {
  it("forwards nothing when no proxy is trusted", () => {
    expect(clientIpFromForwardedFor("203.0.113.9", 0)).toBeNull();
  });

  it("takes the entry appended by the trusted proxy, ignoring client-supplied entries to its left", () => {
    // The client sent a spoofed first hop; our proxy appended the real address last.
    expect(clientIpFromForwardedFor("10.10.10.10, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIpFromForwardedFor("1.1.1.1, 2.2.2.2, 203.0.113.9", 2)).toBe("2.2.2.2");
  });

  it("returns null when the header is missing, shorter than the trust depth, or not an IP", () => {
    expect(clientIpFromForwardedFor(null, 1)).toBeNull();
    expect(clientIpFromForwardedFor("203.0.113.9", 3)).toBeNull();
    expect(clientIpFromForwardedFor("not-an-ip", 1)).toBeNull();
  });

  it("accepts IPv6 addresses", () => {
    expect(clientIpFromForwardedFor("2001:db8::1", 1)).toBe("2001:db8::1");
  });
});
