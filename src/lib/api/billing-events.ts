// Read-only state for a school whose account is suspended (402 billing.suspended, backend §8.4).
// Set by any API call that answers 402; cleared when the session is cleared. Read through
// useSyncExternalStore by the shell banner and by write controls.

let suspended = false;
const listeners = new Set<() => void>();

export function markBillingSuspended(): void {
  if (suspended) return;
  suspended = true;
  for (const l of listeners) l();
}

export function clearBillingSuspended(): void {
  if (!suspended) return;
  suspended = false;
  for (const l of listeners) l();
}

export function isBillingSuspended(): boolean {
  return suspended;
}

export function subscribeBillingSuspended(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
