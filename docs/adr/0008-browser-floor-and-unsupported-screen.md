# ADR 0008: Browser floor and the unsupported-browser screen

Status: accepted (F1).

## Decisions

1. **Floor:** Chrome and Edge 111+, Firefox 111+, Safari 16.4+. This is Next.js's default browserslist and the Tailwind CSS v4 baseline (oklch colours, `color-mix()`, `@property`, `:where()`).
2. **No polyfills.** Older browsers get the unsupported screen instead of a degraded app. Polyfills would add first-load JavaScript to every parent on every phone.
3. **Feature detection** runs in a small external script (`public/browser-check.js`), loaded from the layout with the request's CSP nonce. It checks `CSS.supports()` for `oklch()`, `color-mix()`, `:where()`, and `CSS.registerProperty`, and `window.ReadableStream`. If any check fails, it replaces the page with `/unsupported.html`.
4. **The unsupported page is static** (`public/unsupported.html`): no script, inline styles, plain-language text, and advice to update the browser or open the school's site in another browser. It is outside the proxy matcher, so it needs no CSP nonce. A redirect loop is prevented by checking the current path first.
5. **One list, two copies.** The checks are defined once in `src/lib/browser/support.ts` (tested). The script carries a copy, because it runs before the app bundle. A test asserts the copy and the source are identical, so the lists cannot drift.

## Consequences

- Users on older phones see a clear message rather than a broken page. OI-10 asks the owner to confirm that this floor covers the devices in use.
- Adding a required feature later means updating `support.ts` and this ADR together.
