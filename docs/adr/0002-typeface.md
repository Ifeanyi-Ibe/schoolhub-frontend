# ADR 0002: Typeface

Status: accepted (F0).

## Context

The brief asks for one readable, self-hosted typeface. Parents read on low-end Android phones over slow networks. Money and tables need tabular figures.

## Decision

- **Inter** for body text, UI and numerals. Loaded as a Latin-subset variable font through `next/font/google`, which self-hosts the file at build time (no runtime request to Google).
- **Plus Jakarta Sans** for headings only. Same loading method, Latin subset, variable.
- Money and tables use tabular numerals (`font-variant-numeric: tabular-nums`). Inter ships a `tnum` feature. We verify this in the built font file during F0 rather than assuming it.

## Consequences

- Two font files load on first visit. Both are subset and variable to keep the count and size low. Budgets (170 KB JS) do not include fonts, but LCP does, so `display: swap` is set.
- If the built font lacks `tnum`, this ADR is revisited before F2 (money screens).
