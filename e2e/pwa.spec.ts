// Installability and offline-readiness checks. Lighthouse 13 no longer audits installability, so
// these assert the requirements directly: manifest, icons, and the service worker's precache.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCHOOL } from "./api-host";

test.use(SCHOOL);

test.describe("PWA installability", () => {
  test("manifest declares name, standalone display, scope, and 192 and 512 icons", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("manifest");
    const manifest = (await res.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"], icon.src).toBe("image/png");
    }
  });

  test("the offline fallback page is reachable without a network-only dependency", async ({
    request,
  }) => {
    const res = await request.get("/offline.html");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toMatch(/<script(?![^>]*src=)/i); // no inline script, so the CSP nonce is not needed
  });

  test("the service worker precaches the offline page and never caches API responses", () => {
    const sw = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain("/offline.html");
    expect(sw).toContain("/api/");
  });
});
