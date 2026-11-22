// The parent's view of payments (ADR 0021). A payment is confirmed only by the server's status after the gateway returns:
// the redirect back to the school is not proof of payment.

export type PaymentOutcome = "confirmed" | "pending" | "failed";

/** What the parent is told about a payment, from the server's status alone. */
export function paymentOutcome(status: string): PaymentOutcome {
  if (status === "Succeeded") return "confirmed";
  if (status === "Failed") return "failed";
  return "pending";
}

/** An admission number is copied as typed: no spaces at either end, nothing else changed. */
export function admissionForCopy(admissionNo: string): string {
  return admissionNo.trim();
}
