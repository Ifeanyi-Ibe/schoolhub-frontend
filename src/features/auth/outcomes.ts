// Pure mapping from BFF results to what the user reads. Sign-in failures share one message for
// every credential failure, so the UI never reveals whether an account exists (no enumeration).
import type { AuthCall } from "./http";

export type LoginMessage = "invalid" | "notFound" | "unavailable" | "billing" | "rate" | "generic";

export function loginFailure(call: Extract<AuthCall, { ok: false }>): LoginMessage {
  if (call.status === 0 || call.code === "network") return "unavailable";
  if (call.status === 429) return "rate";
  if (call.status === 402 || call.code === "billing.suspended") return "billing";
  if (call.status === 404 || call.code === "tenancy.not_found") return "notFound";
  if (call.status === 401 || call.status === 400 || call.status === 403) {
    // Credential failures (wrong password, unknown account, locked out) all read the same.
    return "invalid";
  }
  if (call.status >= 500 || call.status === 503 || call.status === 502) return "unavailable";
  return "generic";
}

/** Which screen follows a successful sign-in step. */
export function nextStep(
  body: Record<string, unknown>,
): "signed_in" | "mfa_required" | "enrollment_required" | "unknown" {
  const status = body.status;
  if (status === "signed_in" || status === "mfa_required" || status === "enrollment_required")
    return status;
  return "unknown";
}

/** Where the user goes after sign-in: their validated return path, or the home page. */
export function afterSignIn(next: string | null | undefined): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/home";
}
