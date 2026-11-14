import { describe, expect, it } from "vitest";
import { checkBudgets, gzipBytes, initialScriptUrls, sumGzip } from "./bundle-size-lib.mjs";

describe("initialScriptUrls", () => {
  it("collects same-origin script tags and script preloads, once each", () => {
    const html = `
      <script src="/_next/static/chunks/main-1.js" async=""></script>
      <script src="https://cdn.example/x.js"></script>
      <link rel="modulepreload" href="/_next/static/chunks/app-2.js" as="script">
      <link rel="stylesheet" href="/_next/static/css/a.css">
      <script src="/_next/static/chunks/main-1.js"></script>`;
    expect(initialScriptUrls(html)).toEqual([
      "/_next/static/chunks/main-1.js",
      "/_next/static/chunks/app-2.js",
    ]);
  });

  it("ignores nomodule scripts, which only legacy browsers download", () => {
    const html = `<script src="/_next/static/chunks/polyfills-1.js" noModule=""></script><script src="/_next/static/chunks/m.js"></script>`;
    expect(initialScriptUrls(html)).toEqual(["/_next/static/chunks/m.js"]);
  });

  it("strips query strings from asset URLs", () => {
    expect(initialScriptUrls(`<script src="/_next/static/chunks/a.js?v=3"></script>`)).toEqual([
      "/_next/static/chunks/a.js",
    ]);
  });
});

describe("gzipBytes and sums", () => {
  it("measures gzip size, which is smaller than raw for repetitive input", () => {
    const raw = Buffer.from("x".repeat(10_000));
    expect(gzipBytes(raw)).toBeLessThan(raw.length);
    expect(sumGzip([{ gzipBytes: 3 }, { gzipBytes: 4 }])).toBe(7);
  });
});

describe("checkBudgets", () => {
  it("passes when every measured route is within budget", () => {
    expect(checkBudgets({ "/": 100 }, { "/": 170 })).toEqual([]);
  });

  it("fails over-budget routes and routes that were not measured", () => {
    expect(checkBudgets({ "/": 200 }, { "/": 170 })[0]).toMatch(/exceeds budget/);
    expect(checkBudgets({}, { "/parent": 170 })[0]).toMatch(/no measurement/);
  });
});
