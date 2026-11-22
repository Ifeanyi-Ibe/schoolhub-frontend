# 0017: Attendance (F5): registers, offline queue and sync

- **Status:** Accepted, 2026-11-21.

## Context

F5 adds the attendance register: a teacher takes attendance for an assigned class arm on a date, submits it, and reads
reports. Teachers must be able to mark attendance without a connection (the plan says "offline with a queue"), so
marks are queued on the device and sent when the connection returns. The contract supports this: each register row
carries `clientId` and `clientUpdatedAt`, the bulk write declares `Idempotency-Key`, and the answer reports applied,
ignored and rejected rows. CLAUDE.md forbids storing personal data in IndexedDB, and the plan's cache would hold names.

## Decisions

1. **The offline store holds no personal data.** The queue stores the register key (class arm, date, period), each
   student's opaque id, status, arrival time, `clientId` and `clientUpdatedAt`. Names and admission numbers are not
   stored, so an offline register is marked by row number in the order the server gave. Notes are not queued and are
   not editable in this slice: they are free text and may hold personal data, and a note needs its own decision. **Open decision (see OPEN_ITEMS):**
   showing names offline needs an encrypted local roster and a key policy, which CLAUDE.md does not yet allow.
2. **IndexedDB through a small typed wrapper, not Dexie** (ADR 0018, which amends this point). One database, two
   tables: `queue` (pending register saves) and `rosters` (the student-id order per register, to mark offline).
3. **Foreground sync only, while an attendance screen is open.** The queue is flushed when the browser comes online,
   when the page regains focus, and on "Sync now". The sync code loads only under the attendance routes, so the
   database is not part of every page's bundle. Background Sync is not used: it is not available in iOS Safari, and
   one path for every browser is simpler to verify. Flushing runs in order, one request at a time.
4. **One queue item per save, one `Idempotency-Key` per item.** The key is created when the item is queued and reused
   on every retry, so a retry after a dropped response applies once.
5. **Per-row results are shown, never dropped silently.** `applied` clears the row. `ignored_newer_exists` clears it
   and is counted in the summary (a newer mark is already on the server). `rejected` keeps the row in the queue as
   "needs attention", with the server's reason. The teacher edits it and sends it again, or discards it explicitly.
   A network failure or server error leaves every item pending.
6. **Submit and reopen are online only and are not queued.** Submit changes the register's status and raises alerts,
   so it is refused while queued marks for the register are pending. Reopen needs `attendance.edit.past` and a reason.
7. **Daily registers only in this phase.** The register is taken for the whole day (`period` null). Subject-period
   registers are deferred with the period settings.
8. **Sign-out and session end wipe the store** (CLAUDE.md, shared phones). Sign-out with pending marks asks the user to
   confirm first, and says how many marks would be lost.
9. **The parent view of a ward's attendance is deferred** to a later slice. The endpoint is typed; the parent screen
   needs the server-rendered parent route and the light formatter (ADR 0013), built separately.

## Consequences

- An offline register cannot show names. Teachers who work offline mark by row number, which is slower and error-prone.
  The decision in point 1 is the one to revisit with the user.
- Sync is foreground-only: marks queued on a device wait until an attendance screen is open. The home screen shows the
  count of unsynced marks, and sign-out warns about them.
