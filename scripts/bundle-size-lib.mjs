// Pure helpers for the bundle-size gate. Kept separate from the runner so they can be unit tested.
import { gzipSync } from "node:zlib";

/**
 * JavaScript URLs a page loads on first paint, read from its HTML: <script src> and
 * modulepreload/preload links for scripts. Only same-origin /_next/static assets are counted.
 */
export function initialScriptUrls(html) {
  const urls = new Set();
  // nomodule scripts are for legacy browsers only: modern browsers never download them.
  const scriptTag = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi;
  for (const m of html.matchAll(scriptTag)) {
    if (!/\bnomodule\b/i.test(m[0])) urls.add(m[1]);
  }
  const linkTag = /<link\b[^>]*>/gi;
  for (const m of html.matchAll(linkTag)) {
    const tag = m[0];
    const isScriptPreload =
      /\brel="(modulepreload|preload)"/i.test(tag) && /\bas="script"/i.test(tag);
    const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
    if (isScriptPreload && href) urls.add(href);
  }
  const clean = [...urls].map((u) => u.split("?")[0]);
  return [...new Set(clean)].filter((u) => u.startsWith("/_next/static/") && u.endsWith(".js"));
}

/** Gzip size in bytes, level 9 (the same order of magnitude as CDN gzip). */
export function gzipBytes(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

/** Sum of gzipped sizes, with each URL counted once. */
export function sumGzip(assets) {
  return assets.reduce((total, a) => total + a.gzipBytes, 0);
}

/**
 * Checks per-route-group budgets. A group passes when every route in it is measured and within the
 * hard cap. Returns { failures, reports }: failures are strings for CI; reports describe each group's
 * worst route against its target (when set) and cap.
 */
export function checkGroupBudgets(results, groups) {
  const failures = [];
  const reports = [];
  for (const [name, group] of Object.entries(groups)) {
    const routes = Object.keys(group.routes);
    if (routes.length === 0) {
      reports.push({
        group: name,
        routes: [],
        worst: null,
        cap: group.budgetGzipBytes,
        target: group.targetGzipBytes ?? null,
      });
      continue;
    }
    let worst = { route: null, bytes: -1 };
    for (const route of routes) {
      const measured = results[route];
      if (measured === undefined) {
        failures.push(`${name}: ${route} has no measurement`);
        continue;
      }
      if (measured > group.budgetGzipBytes) {
        failures.push(
          `${name}: ${route} ${measured} B gzipped exceeds the group cap ${group.budgetGzipBytes} B`,
        );
      }
      if (measured > worst.bytes) worst = { route, bytes: measured };
    }
    reports.push({
      group: name,
      routes,
      worst,
      cap: group.budgetGzipBytes,
      target: group.targetGzipBytes ?? null,
    });
  }
  return { failures, reports };
}
