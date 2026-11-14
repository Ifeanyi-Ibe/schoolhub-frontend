import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, safeReturnPath } from "./return-path";

const ORIGIN = "https://greenfield.schoolhub.example";

describe("safeReturnPath", () => {
  it("accepts an app-relative path, with its query", () => {
    expect(safeReturnPath("/profile", ORIGIN)).toBe("/profile");
    expect(safeReturnPath("/sessions?tab=active", ORIGIN)).toBe("/sessions?tab=active");
    // A URL inside the query stays same-origin: the path is ours, and nothing redirects to it.
    expect(safeReturnPath("/home?to=https://evil.example", ORIGIN)).toBe(
      "/home?to=https://evil.example",
    );
  });

  it.each([
    ["protocol-relative", "//evil.example/steal"],
    ["backslash trick", "/\\evil.example"],
    ["absolute URL", "https://evil.example/x"],
    ["javascript scheme", "javascript:alert(1)"],
    ["control character", "/home\r\nSet-Cookie: x=1"],
    ["whitespace", "/home /x"],
    ["API path", "/api/bff/api/v1/me"],
    ["sign-in loop", "/login"],
    ["sign-in subpath loop", "/login/mfa"],
    ["empty", ""],
    ["null", null],
    ["too long", "/" + "a".repeat(600)],
  ])("refuses %s and falls back", (_name, raw) => {
    expect(safeReturnPath(raw as string | null, ORIGIN)).toBe(DEFAULT_RETURN_PATH);
  });

  it("uses the fallback given by the caller", () => {
    expect(safeReturnPath("//x", ORIGIN, "/sessions")).toBe("/sessions");
  });
});
