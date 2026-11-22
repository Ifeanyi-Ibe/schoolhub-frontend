"use client";

// The score screen's view of the offline store. The database and the sync code load when the screen opens, not in every page's
// bundle, and sync runs while the screen is open (ADR 0023, as for attendance in ADR 0017).
import { useCallback, useEffect, useState } from "react";
import type { QueuedScoreRow, ScoreQueueItem, ScoresDatabase } from "./db";
import type { ScoreFlushReport } from "./sync";
import type { SheetKey } from "../api";
import { sheetKeyOf } from "../rules";

type Modules = {
  db: ScoresDatabase;
  sync: typeof import("./sync");
};

export interface OfflineScores {
  ready: boolean;
  items: ScoreQueueItem[];
  refresh: () => Promise<void>;
  /** Saves the cells on this device (no network). */
  enqueue: (rows: QueuedScoreRow[]) => Promise<void>;
  /** Sends every pending save; returns what the server said. */
  flush: () => Promise<ScoreFlushReport | null>;
  resend: (id: number) => Promise<void>;
  discard: (id: number) => Promise<void>;
}

export function useOfflineScores(key: SheetKey | null, sheetId: string | null): OfflineScores {
  const [modules, setModules] = useState<Modules | null>(null);
  const [items, setItems] = useState<ScoreQueueItem[]>([]);
  const [version, setVersion] = useState(0);
  const sheetKey = key === null ? null : sheetKeyOf(key);

  useEffect(() => {
    let alive = true;
    void Promise.all([import("./db"), import("./sync")]).then(async ([db, sync]) => {
      const opened = await db.scoresDb();
      if (alive) setModules({ db: opened, sync });
      // Sends what this device still holds, when the page opens online (ADR 0023).
      if (alive && navigator.onLine) {
        await sync.flushScoreQueue(opened);
        if (alive) setVersion((v) => v + 1);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (modules === null || sheetKey === null) return;
      const queued = await modules.db.queue.bySheet(sheetKey);
      if (alive) setItems(queued);
    })();
    return () => {
      alive = false;
    };
  }, [modules, sheetKey, version]);

  return {
    ready: modules !== null,
    items,
    refresh,
    enqueue: async (rows) => {
      // A save before the store is ready must not be lost: it fails loudly, and the screen says so.
      if (modules === null || key === null || sheetId === null)
        throw new Error("score store not ready");
      if (rows.length === 0) return;
      await modules.sync.enqueueScores(modules.db, key, sheetId, rows);
      await refresh();
    },
    flush: async () => {
      if (modules === null) return null;
      const report = await modules.sync.flushScoreQueue(modules.db);
      await refresh();
      return report;
    },
    resend: async (id) => {
      if (modules === null) return;
      await modules.sync.resendRefusedScores(modules.db, id);
      await refresh();
    },
    discard: async (id) => {
      if (modules === null) return;
      await modules.sync.discardScoreItem(modules.db, id);
      await refresh();
    },
  };
}
