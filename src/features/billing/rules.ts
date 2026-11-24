// Billing rules (ADR 0025, slice 6). Money is integer kobo; an amount is shown as naira only when the invoice is in naira, so that a
// currency the screen does not format is never shown as if it were naira.

export const PAY_UNAVAILABLE = 503;

/** An invoice can be paid while it has no payment date. */
export function isPayable(invoice: { paidAt: string | null }): boolean {
  return invoice.paidAt === null;
}

/** The text for an amount: naira for NGN, otherwise the amount and its currency code, as the server sends them. */
export function amountLabel(kobo: number, currency: string): { naira: boolean; text: string } {
  if (currency === "NGN" && Number.isSafeInteger(kobo)) return { naira: true, text: String(kobo) };
  return { naira: false, text: `${kobo} ${currency}`.trim() };
}
