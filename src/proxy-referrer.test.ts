import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("Referrer-Policy on the one-time-token pages (B-18)", () => {
  const policy = (url: string) => proxy(new NextRequest(url)).headers.get("Referrer-Policy");

  it("sends no-referrer on the invitation and reset pages, whatever the query", () => {
    expect(policy("https://demo.example/accept-invite?token=secret")).toBe("no-referrer");
    expect(policy("https://demo.example/reset-password#token=secret")).toBe("no-referrer");
  });

  it("keeps the default policy everywhere else", () => {
    expect(policy("https://demo.example/login")).toBe("strict-origin-when-cross-origin");
  });
});
