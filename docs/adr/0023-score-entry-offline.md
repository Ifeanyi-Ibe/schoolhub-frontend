# 0023: Score entry offline (F7, slice 2)

- **Status:** Accepted, 2026-11-22.

## Context

A teacher enters scores in a classroom where the connection can drop. F5 solved the same problem for attendance (ADR 0017,
0018): a queue on the device, sent when the connection returns. Scores differ in two ways. A cell is saved on its own, and the
server settles conflicts per cell by its own last-write-wins rule (the contract's `clientUpdatedAt`). Workflow steps (open,
submit, approve, reopen) change who may edit a sheet, so they cannot wait in a queue.

## Decisions

1. **The device stores ids and values only.** A queued item holds the sheet's key, the sheet's id, the scores (student id,
   component id, score, absent flag, and the time of the entry) and the client's key for the save. No names and no admission
   numbers (ADR 0017). The names come from the in-memory copy of the sheet. A sheet is not kept on the device, so a page that
   is reloaded while offline cannot open a sheet until the connection returns.
2. **Each save is one queue item, with one key.** The key is reused on every retry of that save. A refused cell stays in the
   queue with the server's reason until the teacher resends it (under a new key) or discards it. Nothing is dropped silently.
3. **The server decides conflicts, by last write wins.** Each queued cell carries the time it was entered. The server keeps
   the newer value for a cell. A cell the server already holds a newer value for is settled and counted as "already newer on
   the school's record", not as an error.
4. **Only score entry is offline.** Opening a sheet, submitting, approving and reopening need a connection, because each one
   changes what may happen next. A sheet cannot be submitted while cells for it are still queued on the device.
5. **When the queue is sent.** When the page opens online, when the connection returns, and on "Send now". One send runs at a
   time. A connection or server failure keeps every item for the next attempt. A session end stops the send and keeps the
   items.
6. **The device keeps nothing after sign-out or session end.** Both wipe the score queue. Sign-out warns with the number of
   unsent scores (attendance and scores together) before it wipes them.
7. **What the screen shows.** Cells on the device show over the server's values, labelled as waiting to send. Refused cells
   are listed with their reasons. The result of a send (saved, already newer, refused) is shown after it, and is not shown as
   saved until the server has said so.

## Consequences

- The queue is per device. Two devices entering scores for the same cell resolve by time, as the server records it.
- A reload while offline does not show the sheet. The screen says the sheet could not be loaded; the queued cells are still on
  the device and are sent when the screen opens online.
- The send trigger uses the screen's connection state, not only the browser's `online` event. The shared sync-on-return
  listener did not run on the score screen during the browser test (see the change history in the F7 slice 2 commits).
