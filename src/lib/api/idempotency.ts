// Idempotency and concurrency policy for API writes.
//
// - One Idempotency-Key per user action, reused on every retry of that action.
// - Auto-retry only operations whose contract declares Idempotency-Key.
// - Send If-Match only on operations whose contract declares it.
// Undeclared headers are never sent (BACKEND_GAPS B-05, B-06).

import { findOperation } from "@/lib/capabilities";

export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 128;

/** A fresh key for one user action. Create it when the action starts, not per attempt. */
export function newActionKey(): string {
  return globalThis.crypto.randomUUID();
}

export function isValidIdempotencyKey(key: string): boolean {
  return key.length >= IDEMPOTENCY_KEY_MIN && key.length <= IDEMPOTENCY_KEY_MAX;
}

/** Auto-retry allowed only when the contract declares Idempotency-Key for this operation. */
export function canAutoRetry(method: string, path: string): boolean {
  return findOperation(method, path)?.idempotent === true;
}

export interface WritePolicyInput {
  method: string;
  path: string;
  idempotencyKey?: string;
  /** rowVersion from the last read, sent as If-Match when the contract declares it. */
  rowVersion?: number | string | null;
}

export interface WritePolicy {
  headers: Record<string, string>;
  sent: { idempotencyKey: boolean; ifMatch: boolean };
}

/** Headers for one write, limited to what the contract declares for that operation. */
export function writePolicyHeaders(input: WritePolicyInput): WritePolicy {
  const op = findOperation(input.method, input.path);
  const headers: Record<string, string> = {};
  const sent = { idempotencyKey: false, ifMatch: false };
  if (op?.idempotent && input.idempotencyKey !== undefined) {
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      throw new RangeError("Idempotency-Key must be 8 to 128 characters");
    }
    headers["Idempotency-Key"] = input.idempotencyKey;
    sent.idempotencyKey = true;
  }
  if (op?.ifMatch && input.rowVersion !== undefined && input.rowVersion !== null) {
    headers["If-Match"] = String(input.rowVersion);
    sent.ifMatch = true;
  }
  return { headers, sent };
}
