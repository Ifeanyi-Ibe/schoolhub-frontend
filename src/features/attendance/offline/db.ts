// The attendance offline store (ADR 0017, 0018). It holds no personal data: no names, no admission numbers, no notes. A
// queued item is a register key, opaque student ids, statuses, arrival times and the client's ids and times.
// A small typed wrapper over IndexedDB: two tables and the few operations they need (ADR 0018 explains why not Dexie).

import type { AttendanceStatus } from "../rules";

export type QueueState = "pending" | "needsAttention";

export interface QueueItem {
  id?: number;
  registerKey: string;
  classArmId: string;
  date: string;
  period: string | null;
  /** One key per queued save, reused on every retry (the contract declares Idempotency-Key on the register write). */
  idempotencyKey: string;
  createdAt: string;
  state: QueueState;
  marks: QueuedMarkRecord[];
  /** Rows the server refused, with its reason. They stay here until the teacher resends or discards them. */
  refused: Array<{ studentId: string; reason: string }>;
  /** Why the whole save was refused, when it was (for example a locked register). */
  refusedWhole: string | null;
}

/** A queued mark as stored (the same fields as QueuedMark in rules.ts). */
export interface QueuedMarkRecord {
  studentId: string;
  status: AttendanceStatus;
  arrivalTime: string | null;
  clientId: string;
  clientUpdatedAt: string;
}

/** The student order of a register as last loaded online. Ids only: the order lets a row be marked offline. */
export interface RosterRecord {
  registerKey: string;
  studentIds: string[];
  savedAt: string;
}

const DB_NAME = "schoolhub-attendance";
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

export class AttendanceDatabase {
  constructor(readonly idb: IDBDatabase) {}

  readonly queue = {
    add: async (item: Omit<QueueItem, "id">): Promise<number> => {
      const tx = this.idb.transaction("queue", "readwrite");
      const id = await request(tx.objectStore("queue").add(item));
      await done(tx);
      return Number(id);
    },
    get: async (id: number): Promise<QueueItem | undefined> => {
      const tx = this.idb.transaction("queue", "readonly");
      const item = await request(tx.objectStore("queue").get(id));
      return item as QueueItem | undefined;
    },
    update: async (id: number, patch: Partial<QueueItem>): Promise<void> => {
      const tx = this.idb.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      const current = await request(store.get(id));
      if (current) store.put({ ...(current as QueueItem), ...patch, id });
      await done(tx);
    },
    delete: async (id: number): Promise<void> => {
      const tx = this.idb.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(id);
      await done(tx);
    },
    /** Every item, in the order they were queued. */
    all: async (): Promise<QueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      return (await request(tx.objectStore("queue").getAll())) as QueueItem[];
    },
    /** The items in one state (pending or needing attention), oldest first. */
    byState: async (state: QueueState): Promise<QueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      const index = tx.objectStore("queue").index("state");
      return (await request(index.getAll(state))) as QueueItem[];
    },
    /** The items for one register, oldest first. */
    byRegister: async (registerKey: string): Promise<QueueItem[]> => {
      const tx = this.idb.transaction("queue", "readonly");
      const index = tx.objectStore("queue").index("registerKey");
      return (await request(index.getAll(registerKey))) as QueueItem[];
    },
    count: async (): Promise<number> => {
      const tx = this.idb.transaction("queue", "readonly");
      return request(tx.objectStore("queue").count());
    },
  };

  readonly rosters = {
    get: async (registerKey: string): Promise<RosterRecord | undefined> => {
      const tx = this.idb.transaction("rosters", "readonly");
      return (await request(tx.objectStore("rosters").get(registerKey))) as
        RosterRecord | undefined;
    },
    put: async (record: RosterRecord): Promise<void> => {
      const tx = this.idb.transaction("rosters", "readwrite");
      tx.objectStore("rosters").put(record);
      await done(tx);
    },
  };
}

let opening: Promise<AttendanceDatabase> | null = null;

/** The database, opened on first use (in the browser only; nothing opens at import). */
export function attendanceDb(): Promise<AttendanceDatabase> {
  opening ??= new Promise<AttendanceDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      const queue = idb.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      queue.createIndex("registerKey", "registerKey");
      queue.createIndex("state", "state");
      idb.createObjectStore("rosters", { keyPath: "registerKey" });
    };
    req.onsuccess = () => resolve(new AttendanceDatabase(req.result));
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

/** Removes every attendance record from this device: on sign-out and on session end (CLAUDE.md, shared phones). */
export async function wipeAttendanceStore(): Promise<void> {
  const db = await attendanceDb();
  const tx = db.idb.transaction(["queue", "rosters"], "readwrite");
  tx.objectStore("queue").clear();
  tx.objectStore("rosters").clear();
  await done(tx);
}
