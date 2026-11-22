# 0018: The attendance offline store uses IndexedDB directly, not Dexie

- **Status:** Accepted, 2026-11-21. Amends ADR 0004 (Dexie is no longer a dependency) and ADR 0017 point 2.

## Context

ADR 0017 chose Dexie 4.4.7 for the offline queue, as the stack lists it. Measured on the production build, Dexie alone is
30,964 B gzipped. The attendance home and register routes then went over their route-specific budget (40,960 B): the
home route at 63,405 B and the register at 67,216 B. The store needs two tables and a handful of operations, which the
browser's IndexedDB API provides directly.

## Decision

1. **A small typed wrapper over IndexedDB** (`src/features/attendance/offline/db.ts`) replaces Dexie. It has the two
   tables, the indexes the queue reads by (register key and state), and the operations the sync code uses.
2. **Dexie is removed** from the dependencies. `fake-indexeddb` (pinned, dev only) runs the store's tests.
3. **The store opens on demand.** The home screen no longer opens it on load; the register and the sign-out check do.
   The home screen therefore does not show a count of unsynced marks; the register shows it.

## Consequences

- The store is about a few kilobytes, and the attendance routes are measured against the same budgets as the rest.
- The store's own code is ours to maintain: it has unit tests (`sync.test.ts`) covering the queue, the sync results,
  the stop conditions, the key reuse and the wipe.
- The home screen's unsynced count is gone (point 3). Revisit if teachers need it on the home screen; the cost is the
  store's module on the home route.
