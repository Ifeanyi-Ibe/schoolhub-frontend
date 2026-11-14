// Invoice display state. The backend marks every unpaid invoice past its due date as Overdue, so a
// part-paid invoice can also read Overdue. "Part-paid" is therefore derived from the amounts, and a
// part-paid invoice that is past due says so. Returns message keys (messages/en.json, fees.invoiceState).

export interface InvoiceAmounts {
  status: string;
  paidKobo: number;
  balanceKobo: number;
}

export type InvoiceStateKey =
  "paid" | "partPaid" | "partPaidOverdue" | "overdue" | "issued" | "void" | "draft" | "other";

export function invoiceStateKey(i: InvoiceAmounts): InvoiceStateKey {
  if (i.status === "Void" || i.status === "Cancelled") return "void";
  if (i.status === "Draft") return "draft";
  if (i.balanceKobo <= 0) return "paid";
  if (i.paidKobo > 0) return i.status === "Overdue" ? "partPaidOverdue" : "partPaid";
  if (i.status === "Overdue") return "overdue";
  if (i.status === "Issued") return "issued";
  return "other";
}
