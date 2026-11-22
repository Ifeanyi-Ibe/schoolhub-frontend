// The offline stores this device keeps: attendance (ADR 0017) and score entry (ADR 0023). Sign-out and session end use these, so
// the shell's code stays small: each store loads only when it is needed.

/** Items the device has not yet sent, across every store. Sign-out warns with this count before it wipes them. */
export async function unsynced(): Promise<number> {
  const [attendance, scores] = await Promise.all([
    import("@/features/attendance/offline/db").then(async (m) =>
      (await m.attendanceDb()).queue.count(),
    ),
    import("@/features/assessment/offline/db").then(async (m) =>
      (await m.scoresDb()).queue.count(),
    ),
  ]);
  return attendance + scores;
}

/** Removes every offline record from this device (sign-out and session end, CLAUDE.md shared phones). */
export async function wipeStores(): Promise<void> {
  await Promise.all([
    import("@/features/attendance/offline/db").then((m) => m.wipeAttendanceStore()),
    import("@/features/assessment/offline/db").then((m) => m.wipeScoresStore()),
  ]);
}
