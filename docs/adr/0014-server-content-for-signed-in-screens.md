# 0014: Signed-in screens render their content on the server, from data passed as props

- **Status:** Accepted for `/people` (2026-11-21). Other staff and parent screens still need the same change (see Open).

## Context

`/people` was measured at an LCP of 3.2 to 3.8 s (Lighthouse, mobile, simulated 4G, median of three). The
brief expected content in the HTML at about 0.5 s and the paint at about 2.3 s.

The earlier check that "the first HTML holds the list" passed, but it looked for text in the page's serialized
data, not in the visible markup. Loading the page with JavaScript disabled showed the truth: the server sent
the title only. The signed-in data (account, school, first page of people) was prefetched on the server and
placed in the cache state, but `PeopleView` still rendered its loading branch on the server. The content
appeared only after the client bundle hydrated, which the throttled CPU took about 2 s to do.

Measured in the throttled Chromium harness: the school name painted at about 0.65 s; the header paragraph and
the list entered the DOM at about 2.2 s; long tasks were under 80 ms, so the main thread was not busy
during that gap.

## Decision

The people route passes the prefetched account and first page to `PeopleView` as props
(`initialMe`, `initialList`), read with `prefetchedData` (`src/server/prefetch.ts`). `PeopleView` uses them as
`initialData`, so the first render (and the server HTML) holds the content. The cache keeps the data current
after hydration, as before. Permission checks remain UX only (CLAUDE.md).

## Measurements (2026-11-21)

Lighthouse, `lighthouserc.people.json`, mobile 360 px, simulated 4G, CPU 4x, three runs:

| Run                                   | Performance | LCP          | FCP          | Accessibility |
| ------------------------------------- | ----------- | ------------ | ------------ | ------------- |
| Before (median of three earlier runs) | 64 to 81    | 3.2 to 3.8 s | 0.8 to 0.9 s | 100           |
| After 1                               | 89          | 0.78 s       | 0.78 s       | 100           |
| After 2                               | 90          | 0.76 s       | 0.76 s       | 100           |
| After 3                               | 90          | 0.76 s       | 0.76 s       | 100           |

Median after: performance 90, LCP 0.76 s, accessibility 100. The staff target stays at the parent target
of 2.5 s; the 3.0 s fallback in the steering note is not needed for `/people`.

Test: `e2e/staff.spec.ts`, "with JavaScript off, the server HTML shows the people screen's content" (desktop
and mobile pass, 21 tests).

## Open: the same gap on other screens

With JavaScript disabled, these screens still show only their title or nothing: `/home` (no prefetch),
`/academics/levels`, `/settings`, and (not measured here) `/roles`, `/academics/subjects`, `/academics/grading`,
`/academics/assessment`, `/academics/calendar`, `/academics/sessions`, `/sessions`, `/profile`. Each needs the
same change: the page passes its prefetched data as props. Until then their LCP is the hydration time.

## Rule

A signed-in screen that prefetches its data passes the data to its client component as props, so the server
HTML holds the content. A test with JavaScript disabled checks the visible text (not the serialized data).
