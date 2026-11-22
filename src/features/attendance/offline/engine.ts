"use client";

// The attendance screens' view of the offline store. The database and the sync code load when an attendance screen
// opens (not in every page's bundle), and sync runs while such a screen is open (ADR 0017).
import { useCallback, useEffect, useState } from "react";
import { registerKey, type QueuedMark, type RegisterKey } from "../rules";
import type { AttendanceDatabase, QueueItem, RosterRecord } from "./db";
import type { FlushReport } from "./sync";

type Modules = {
  db: AttendanceDatabase;
  sync: typeof import("./sync");
};

export interface OfflineRegister {
  ready: boolean;
  items: QueueItem[];
  roster: string[] | null;
  refresh: () => Promise<void>;
  /** Saves the marks on this device (no network). */
  enqueue: (marks: QueuedMark[]) => Promise<void>;
  /** Sends every pending save; returns what the server said. */
  flush: () => Promise<FlushReport | null>;
  resend: (id: number) => Promise<void>;
  discard: (id: number) => Promise<void>;
  /** Keeps the student order of this register on the device, so it can be marked offline. */
  keepRoster: (studentIds: string[]) => Promise<void>;
  /** The number of queued saves for this register right now (read from the store, not from the screen's copy). */
  openCount: () => Promise<number>;
}

export function useOfflineRegister(key: RegisterKey | null): OfflineRegister {
  const [modules, setModules] = useState<Modules | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [roster, setRoster] = useState<string[] | null>(null);
  const rk = key === null ? null : registerKey(key);

  useEffect(() => {
    let alive = true;
    void Promise.all([import("./db"), import("./sync")]).then(async ([db, sync]) => {
      const opened = await db.attendanceDb();
      if (alive) setModules({ db: opened, sync });
    });
    return () => {
      alive = false;
    };
  }, []);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (modules === null || rk === null) return;
      const [queued, rec] = await Promise.all([
        modules.db.queue.byRegister(rk),
        modules.db.rosters.get(rk),
      ]);
      if (!alive) return;
      setItems(queued);
      setRoster((rec as RosterRecord | undefined)?.studentIds ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [modules, rk, version]);

  return {
    ready: modules !== null,
    items,
    roster,
    refresh,
    enqueue: async (marks) => {
      // A save before the store is ready must not be lost: it fails loudly, and the screen says so.
      if (modules === null || key === null) throw new Error("attendance store not ready");
      if (marks.length === 0) return;
      await modules.sync.enqueueMarks(modules.db, key, marks);
      await refresh();
    },
    flush: async () => {
      if (modules === null) return null;
      const report = await modules.sync.flushQueue(modules.db);
      await refresh();
      return report;
    },
    resend: async (id) => {
      if (modules === null) return;
      await modules.sync.resendRefused(modules.db, id);
      await refresh();
    },
    discard: async (id) => {
      if (modules === null) return;
      await modules.sync.discardItem(modules.db, id);
      await refresh();
    },
    openCount: async () => {
      if (modules === null || rk === null) return 0;
      return (await modules.db.queue.byRegister(rk)).length;
    },
    keepRoster: async (studentIds) => {
      if (modules === null || rk === null) return;
      await modules.db.rosters.put({
        registerKey: rk,
        studentIds,
        savedAt: new Date().toISOString(),
      });
      setRoster(studentIds);
    },
  };
}

/** Runs a flush when the browser comes back online, when the page regains focus, and when the page is shown again. */
export function useSyncOnReturn(flush: () => void): void {
  useEffect(() => {
    const onOnline = () => flush();
    const onFocus = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);
}
