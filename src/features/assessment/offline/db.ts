// The score sheets' offline store (ADR 0023). It holds no personal data: no names, no admission numbers. A queued item is a
// sheet key, the sheet's id, the scores the teacher entered (cell by cell, with the time of each entry) and the client's
// key for the save. A small typed wrapper over IndexedDB, as for attendance (ADR 0018).

export type QueueState = "pending" | "needsAttention";

export interface QueuedScoreRow {
  studentId: string;
  componentId: string;
  /** A decimal string with at most one decimal place, or null for a blank cell. */
  score: string | null;
  absent: boolean;
  /** When the teacher entered this cell on this device. The server keeps the newer value (last write wins, ADR 0023). */
  clientUpdatedAt: string;
}

export interface ScoreQueueItem {
  id?: number;
  sheetKey: string;
  sheetId: string;
  /** One key per queued save, reused on every retry (the contract declares Idempotency-Key on the score write). */
  idempotencyKey: string;
  createdAt: string;
  state: QueueState;
  rows: QueuedScoreRow[];
  /** Rows the server refused, with its reason. They stay here until the teacher resends or discards them. */
  refused: Array<{ studentId: string; componentId: string; reason: string }>;
  /** Why the whole save was refused, when it was (for example, the sheet was submitted on another device). */
  refusedWhole: string | null;
}

const DB_NAME = "schoolhub-scores";
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export class ScoresDatabase {
  constructor(readonly idb: IDBDatabase) {}

  readonly queue = {
    add: async (item: Omit<ScoreQueueItem, "id">): Promise<number> => {
      const tx = this.idb.transaction("queue", "readwrite");
      const id = await request(tx.objectStore("queue").add(item));
      await done(tx);
      return Number(id);
    },
    get: async (id: number): Promise<ScoreQueueItem | undefined> => {
      const tx = this.idb.transaction("queue", "readonly");
      return (await request(tx.objectStore("queue").get(id))) as ScoreQueueItem | undefined;
    },
    update: async (id: number, patch: Partial<ScoreQueueItem>): Promise<void> => {
      const tx = this.idb.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      const current = await request(store.get(id));
      if (current) store.put({ ...(current as ScoreQueueItem), ...patch, id });
      await done(tx);
    },
    delete: async (id: number): Promise<void> => {
      const tx = this.idb.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(id);
      await done(tx);
    },
    /** Every item, in the order they were queued. */
    all: async (): Promise<ScoreQueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      return (await request(tx.objectStore("queue").getAll())) as ScoreQueueItem[];
    },
    byState: async (state: QueueState): Promise<ScoreQueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      return (await request(
        tx.objectStore("queue").index("state").getAll(state),
      )) as ScoreQueueItem[];
    },
    bySheet: async (sheetKey: string): Promise<ScoreQueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      return (await request(
        tx.objectStore("queue").index("sheetKey").getAll(sheetKey),
      )) as ScoreQueueItem[];
    },
    count: async (): Promise<number> => {
      const tx = this.idb.transaction("queue", "readonly");
      return request(tx.objectStore("queue").count());
    },
  };
}

let opening: Promise<ScoresDatabase> | null = null;

/** The database, opened on first use (in the browser only; nothing opens at import). */
export function scoresDb(): Promise<ScoresDatabase> {
  opening ??= new Promise<ScoresDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      const queue = idb.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      queue.createIndex("sheetKey", "sheetKey");
      queue.createIndex("state", "state");
    };
    req.onsuccess = () => resolve(new ScoresDatabase(req.result));
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

/** Removes every score record from this device: on sign-out and on session end (CLAUDE.md, shared phones). */
export async function wipeScoresStore(): Promise<void> {
  const db = await scoresDb();
  const tx = db.idb.transaction(["queue"], "readwrite");
  tx.objectStore("queue").clear();
  await done(tx);
}
