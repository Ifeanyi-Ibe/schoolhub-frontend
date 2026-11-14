// What the backend actually offers, read from the generated contract manifest.
//
// The UI never guesses from paths: a feature is shown only when its operations exist in the
// contract. Unbuilt features (BACKEND_GAPS B-14 to B-17) therefore stay hidden, and they appear
// automatically once a regenerated contract includes them.

import { OPERATIONS, type OperationInfo } from "@/lib/api/operations.generated";

const byId = new Map<string, OperationInfo>(OPERATIONS.map((op) => [op.id, op]));

export function operationId(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.startsWith("/") ? path : `/${path}`}`;
}

/** The operation as the contract declares it, or undefined when the backend does not offer it. */
export function findOperation(method: string, path: string): OperationInfo | undefined {
  return byId.get(operationId(method, path));
}

/** True when the contract declares this operation. Use to hide controls for unbuilt features. */
export function isOperationAvailable(method: string, path: string): boolean {
  return byId.has(operationId(method, path));
}

/**
 * True when the backend marks a feature with an x-feature extension (machine-readable flags the
 * backend may add later). A feature with no flag falls back to its operations' availability.
 */
export function isFeatureAvailable(
  feature: string,
  fallback: readonly { method: string; path: string }[] = [],
): boolean {
  if (OPERATIONS.some((op) => op.extensions["x-feature"] === feature)) return true;
  return fallback.length > 0 && fallback.every((f) => isOperationAvailable(f.method, f.path));
}
