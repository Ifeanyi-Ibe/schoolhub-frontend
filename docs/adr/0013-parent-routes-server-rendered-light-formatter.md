# 0013: Parent routes are server-rendered; the full message formatter is not shipped to them

- **Status:** Accepted, 2026-11-16. Staff routes keep the full formatter until the decision in "Open" is taken.

## Context

Every route loaded `next-intl` (with `intl-messageformat` and both ICU parsers, about 12 KB gzipped) from the root layout. The parent-route budget is 174,080 B, and the parent routes were over it (`/home` 174,862 B after the shell redesign). Parent screens and the shared components they use only need simple placeholders, plus plural and select for other messages in the same catalogue.

## Decision

1. The root layout sends only the message paths the parent portal and shared components read (`LIGHT_MESSAGE_PATHS`, `src/i18n/client-namespaces.ts`), through `LightMessagesProvider`.
2. Client text uses `src/i18n/light.ts`, a formatter that reads the same catalogue (`messages/en.json`). It supports `{name}`, `plural` (exact `=N` and the `Intl.PluralRules` categories, with `#`) and `select`, with ICU apostrophe rules. Other argument types throw.
3. `src/i18n/light.test.ts` compares the formatter with `intl-messageformat` for every message in the served paths, for representative values (0, 1, 2, 5, 12, each select key), plus synthetic plural and select cases and the refusal cases. 516 unit tests pass.
4. `NextIntlClientProvider` is no longer in the root layout. The sign-in subtree uses the light formatter (its server-side `getTranslations` runs on the server and ships nothing). Staff screens are in `(app)/(staff)/` and keep the full provider with their own namespaces (`staff`, `academics`).
5. Server-side text stays on the server. Parent screens render their strings through the light hook, not through props from Server Components. Moving more strings to props would shrink the client further and is a candidate for later.

## Measurements (gzipped first-load JS, BUNDLE_REPORT build, same build measured twice: identical)

| Route       | Before (ceiling)                                  | After   | Cap     | Target  |
| ----------- | ------------------------------------------------- | ------- | ------- | ------- |
| `/login`    | 171,966 (172,485 measured after the shell change) | 162,666 | 174,080 | 153,600 |
| `/home`     | 174,285 (174,862 after the shell change)          | 164,370 | 174,080 | 160,000 |
| `/profile`  | 189,288                                           | 165,087 | 174,080 | 160,000 |
| `/sessions` | 175,729                                           | 165,840 | 174,080 | 160,000 |

The 174,285 to 174,862 difference for `/home` came from the first build after the shell redesign (icons and the avatar are client code). Same-build re-measurement is identical, so the drift is a build change, not noise. Not verified by building the earlier commit.

## What remains in the parent chunk (`/home`)

- Next.js runtime: about 130 KB (framework, not reducible here).
- TanStack Query core: 10.6 KB. Kept by decision: the signed-in shell uses it for server data.
- openapi-fetch: 2.2 KB (the API client).
- Light formatter and provider: 2.8 KB. Could shrink, not to 160,000 on its own.
- Shared UI and the shell: about 5.3 KB together.

**Target 160,000 B is not met** for `/home`, `/profile` or `/sessions`: they are 4.4, 5.1 and 5.8 KB over it. The cap holds, with 8 to 14 KB to spare.

## Open

- **Staff ratchet:** staff screens load next-intl and, through the shared components, the light formatter too. Their first load grew about 2.8 KB (`/people` 190,680 B against the ratchet ceiling 187,850 B). Options: (a) move staff screens to the light formatter, which removes next-intl from the app and brings admin routes under their ceilings; (b) accept the increase and raise the staff ceilings (this loosens a ratchet, so it needs the owner's decision).

## Rule (CLAUDE.md)

Parent routes are server-rendered. The client message formatter is not shipped to them by default: parent client text uses the light formatter, and only subtrees that need the full formatter load next-intl.
