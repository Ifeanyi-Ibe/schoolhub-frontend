import { describe, expect, it } from "vitest";
import { extractOneTimeToken } from "./one-time-token";

describe("extractOneTimeToken", () => {
  it("reads the token from the fragment and removes it, keeping the other parameters", () => {
    const r = extractOneTimeToken("https://demo.example/accept-invite?school=demo#token=abc123");
    expect(r).toEqual({
      token: "abc123",
      source: "fragment",
      cleanHref: "https://demo.example/accept-invite?school=demo",
    });
  });

  it("reads the interim token from the query string and removes it, keeping the school", () => {
    const r = extractOneTimeToken("https://demo.example/accept-invite?school=demo&token=abc123");
    expect(r).toEqual({
      token: "abc123",
      source: "query",
      cleanHref: "https://demo.example/accept-invite?school=demo",
    });
  });

  it("prefers the fragment when both carry a token, and removes both copies", () => {
    const r = extractOneTimeToken("https://demo.example/reset-password?token=old#token=new");
    expect(r.token).toBe("new");
    expect(r.cleanHref).toBe("https://demo.example/reset-password");
  });

  it("decodes the token and keeps any other fragment parameters", () => {
    const r = extractOneTimeToken("https://demo.example/reset-password#x=1&token=a%2Bb%3D&y=2");
    expect(r.token).toBe("a+b=");
    expect(r.cleanHref).toBe("https://demo.example/reset-password#x=1&y=2");
  });

  it("reports nothing to remove when the link has no token", () => {
    expect(extractOneTimeToken("https://demo.example/reset-password?school=demo")).toEqual({
      token: "",
      source: "none",
      cleanHref: null,
    });
  });
});
