# ADR 0004: Toolchain and version pins

Status: accepted (F0). Versions checked against the npm registry on 2026-11-14.

## Decisions

1. **TypeScript 5.9.3, not 7.x.** `openapi-typescript@7.13.0` declares `typescript@^5` as a peer. TypeScript 7 fails dependency resolution with it. Revisit when openapi-typescript accepts 6 or 7.
2. **`next build --webpack` for production builds.** Next 16 builds with Turbopack by default. `@serwist/next` is the webpack integration, so production builds use webpack. Dev stays on Turbopack, and Serwist is disabled outside production (`disable` in `next.config.ts`).
3. **Next's default browser floor** (Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+). The legacy polyfill bundle is a `nomodule` script, so modern browsers never download it. The bundle-size gate ignores `nomodule` scripts for the same reason. Older Android WebViews are not supported; OI-10 asks you to confirm this floor.
4. **jsdom 29.x, not 31.x.** jsdom 31 requires Node 22.22.2 or later. The project pins Node 22.20.0 (`.nvmrc`). jsdom 29 supports Node 22.13+.
5. **npm `overrides` for transitive security fixes**, all in `package.json`:
   - `zod@4.6.7` (`@serwist/next` pinned 4.6.5, which is below the 4.6.6 fix).
   - `postcss@8.5.33` (Next and Tailwind ship older versions).
   - `glob@14.0.6` (advisory covers 9.0.0 to 14.0.1).
   - `minimatch@11.0.8` (advisory covers up to 11.0.0).
   - `basic-ftp@6.2.6` (Lighthouse CLI chain).
     `npm audit` reports zero findings for production and for the full tree.
6. **Lighthouse 13.** It no longer has a PWA category, so installability is asserted directly in `e2e/pwa.spec.ts` (manifest, icons, offline page, precache). Lighthouse asserts performance ≥ 0.9, accessibility ≥ 0.95, LCP < 2.5 s.
7. **Packages added only when used.** F0 installs what F0 uses. MSW, React Hook Form, TanStack Table, Dexie and Recharts arrive with the phases that need them.

## Pinned versions

| Package                                              | Version                        |
| ---------------------------------------------------- | ------------------------------ |
| next                                                 | 16.4.6                         |
| react, react-dom                                     | 19.3.1                         |
| typescript                                           | 5.9.3                          |
| tailwindcss, @tailwindcss/postcss                    | 4.3.5                          |
| @tanstack/react-query                                | 5.107.1                        |
| openapi-typescript                                   | 7.13.0                         |
| openapi-fetch                                        | 0.17.0                         |
| zod                                                  | 4.6.7                          |
| next-intl                                            | 4.15.1                         |
| serwist, @serwist/next                               | 9.5.13                         |
| date-fns, @date-fns/tz                               | 4.4.0, 1.5.0                   |
| @radix-ui/react-dialog, -toast, -slot                | 1.3.1, 1.3.1, 1.5.0            |
| vitest, @vitest/coverage-v8                          | 5.1.0                          |
| @testing-library/react, -dom, -jest-dom, -user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.10 |
| @playwright/test, @axe-core/playwright               | 1.65.1, 4.14.0                 |
| @lhci/cli                                            | 0.16.1                         |
| eslint, eslint-config-next                           | 10.15.0, 16.4.6                |

## Consequences

- Upgrading TypeScript, jsdom or the overrides needs an ADR update and a full gate run.
- The `overrides` block hides transitive versions from the lockfile diff. Re-check it on every upgrade with `npm audit`.
