import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

// Node runtime, not edge (ADR 0003). The standalone output is copied into a container image.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Source maps are off by default. BUNDLE_REPORT=1 turns them on for the bundle analysis.
  productionBrowserSourceMaps: process.env.BUNDLE_REPORT === "1",
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// The service worker is built by the webpack plugin, so production builds run with
// `next build --webpack` (Turbopack is the Next 16 default; see package.json).
// Disabled outside production so dev never serves a stale precache.
const withSerwist = withSerwistInit({
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  register: false,
  reloadOnOnline: false,
  cacheOnNavigation: false,
  additionalPrecacheEntries: [{ url: "/offline.html", revision: null }],
});

export default withSerwist(withNextIntl(nextConfig));
