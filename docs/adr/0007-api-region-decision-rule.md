# ADR 0007: API region decision rule

Status: accepted (F1). The region itself is **undecided** (OI-09). This ADR fixes how it will be decided and keeps the frontend independent of the answer.

## Context

Parents use slow, expensive mobile networks. The BFF calls the API on every page load and every refresh. Personal data (students, guardians, payments) is covered by the Nigeria Data Protection Act 2023. A region choice affects latency, cost, and legal exposure, and the three do not always agree.

## Decision rule (applied in this order)

1. **Co-locate the BFF, the API, and the database first.** A BFF in one region calling an API in another adds a round trip to every request, and refresh is on the critical path. The three move together.
2. **Then minimise distance to Lagos.** Among regions that satisfy step 1, choose the nearest by measured round-trip time from Lagos, not by list position.
3. **Then complete a data-protection review before any hosting outside Nigeria.** The review covers the NDPA 2023 transfer conditions, processor contracts, and the school's notice to data subjects. Until it is signed off, personal data stays in-country.

## Frontend consequences

- The region is configuration, not code. The frontend reads `API_BASE_URL`, `APP_BASE_DOMAIN` and `BFF_API_KEY` from the environment. Nothing in the source names a region.
- The container deployment (ADR 0003) must run in the same region as the BFF's API, which is decided by this rule.
- Measured round-trip times from Lagos are recorded in `docs/PROGRESS.md` before the choice is made.

## Open

OI-09 stays open until the three steps are applied and the data-protection review is signed off.
