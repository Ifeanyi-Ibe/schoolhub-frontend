import { describe, expect, it } from "vitest";
import { checkGroupBudgets, gzipBytes, initialScriptUrls, sumGzip } from "./bundle-size-lib.mjs";

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

describe("checkGroupBudgets", () => {
  const groups = {
    auth: { budgetGzipBytes: 170, targetGzipBytes: 150, routes: { "/login": {} } },
    parent: { budgetGzipBytes: 170, routes: { "/home": {}, "/profile": {} } },
    admin: { budgetGzipBytes: 250, routes: {} },
  };

  it("passes when every route in every group is within the cap", () => {
    const { failures, reports } = checkGroupBudgets(
      { "/login": 160, "/home": 100, "/profile": 120 },
      groups,
    );
    expect(failures).toEqual([]);
    expect(reports.find((r) => r.group === "parent")?.worst).toEqual({
      route: "/profile",
      bytes: 120,
    });
  });

  it("fails a route over its group cap, and a route with no measurement", () => {
    const over = checkGroupBudgets({ "/login": 171, "/home": 100, "/profile": 100 }, groups);
    expect(over.failures[0]).toMatch(/auth: \/login 171 B gzipped exceeds the group cap 170 B/);
    const missing = checkGroupBudgets({ "/login": 100, "/home": 100 }, groups);
    expect(missing.failures[0]).toMatch(/parent: \/profile has no measurement/);
  });

  it("reports groups with no routes yet without failing them", () => {
    const { failures, reports } = checkGroupBudgets(
      { "/login": 1, "/home": 1, "/profile": 1 },
      groups,
    );
    expect(failures).toEqual([]);
    expect(reports.find((r) => r.group === "admin")).toMatchObject({
      routes: [],
      worst: null,
      cap: 250,
    });
  });
});
