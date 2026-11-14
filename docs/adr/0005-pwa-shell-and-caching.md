# ADR 0005: PWA shell and caching policy

Status: accepted (F0).

## Decisions

1. **Precache the app shell and static assets only.** Serwist precaches the build output (`/_next/static`), `public/` files, and `/offline.html`. Nothing that depends on a signed-in user is precached.
2. **API responses are never cached by the service worker.** `/api/*` (which includes every BFF route) uses `NetworkOnly`. Responses can hold PII, and phones are shared. Read-mostly parent data gets stale-while-revalidate **in memory** (TanStack Query), not in the service worker.
3. **Offline fallback is a static file, not a route.** `public/offline.html` has no script, and its styles are inline in the file. A route would be rendered per request, so its CSP nonce would not match the cached copy, and the page would fail to load offline. The file is outside the proxy matcher, so it gets no CSP header and inline styles are allowed there. It has no external stylesheet, so it renders without a second request.
4. **No automatic activation of a new service worker.** `skipWaiting` is sent only when the user accepts the in-app update prompt, so a form the user is filling in is never reloaded underneath them. `clientsClaim` is on so an accepted update controls the page immediately.
5. **Lazy UI for the initial load.** The toast region and the offline banner load on demand, and so does the update prompt. The first load for `/` is 156.5 KB gzipped, under the 170 KB budget (174,080 bytes), measured by `scripts/check-bundle-size.mjs`.
6. **Manifest is generic in F0.** The manifest route serves platform defaults. Per-school names, colours and icons arrive once branding is typed in the contract (BACKEND_GAPS B-01, B-02).
7. **Icons are placeholders.** `public/icons/*.png` are solid brand-colour squares generated for F0. They are replaced with the real mark before launch (OI-11).

## Consequences

- Offline attendance and score entry (F5, F7) store data in IndexedDB, scoped to the assigned class, and wipe it on logout. That is a separate store from the service worker cache.
- The service worker is built only by `next build --webpack`. Dev does not register it.
