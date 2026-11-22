// Fees and payments: constants from the contract, the exact naira-to-kobo parse, and the checks the forms need. The API
// decides what is allowed; these checks stop a request the contract would refuse and keep money exact (ADR 0019).

export const FEE_PERMISSION = {
  structures: "fees.structures.manage",
  invoicesCreate: "fees.invoices.create",
  invoicesVoid: "fees.invoices.void",
  paymentsRecord: "fees.payments.record",
  paymentsReverse: "fees.payments.reverse",
  paymentsApprove: "fees.payments.approve",
  discountsApprove: "fees.discounts.approve",
  reportsRead: "fees.reports.read",
} as const;

export const FEE_CATEGORIES = [
  "Tuition",
  "Pta",
  "Uniform",
  "Books",
  "Transport",
  "Exam",
  "Other",
] as const;
export const DISCOUNT_KINDS = ["Percentage", "Fixed"] as const;
export const ADJUSTMENT_KINDS = ["Credit", "Debit"] as const;
export const PAYMENT_METHODS = ["Cash", "Pos", "Cheque", "Transfer", "Card"] as const;

/** The reason fields the contract requires on void, reversal and adjustment (kept short for the audit trail). */
export const REASON_MAX = 300;

const NAIRA = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/**
 * A naira amount as typed ("1500", "1,500.5", "2500.00") to integer kobo, exactly. Returns null for anything that is
 * not a positive amount with at most two decimal places; nothing is rounded.
 */
export function nairaToKobo(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  const m = NAIRA.exec(text);
  if (!m) return null;
  const naira = Number(m[1]);
  const kobo = Number((m[2] ?? "").padEnd(2, "0") || "0");
  const total = naira * 100 + kobo;
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return total;
}

export function koboToNairaText(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const rest = Math.abs(kobo % 100);
  return `${naira}.${String(rest).padStart(2, "0")}`;
}

export function reasonProblem(text: string): string | null {
  const t = text.trim();
  if (t === "") return "reasonRequired";
  if (t.length > REASON_MAX) return "reasonLength";
  return null;
}

/** A discount's value: a whole percentage from 1 to 100, or a fixed amount in kobo. */
export function discountValueProblem(kind: string, value: string): string | null {
  if (kind === "Percentage") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? null : "percentRange";
  }
  return nairaToKobo(value) === null ? "amount" : null;
}

export interface StructureLineDraft {
  feeItemId: string;
  amount: string;
  isOptional: boolean;
}

/** Each line has a fee item and a positive amount, and an item appears once in a structure. */
export function structureLinesProblems(lines: readonly StructureLineDraft[]): string[] {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.feeItemId === "") out.add("feeItemRequired");
    if (nairaToKobo(line.amount) === null) out.add("amount");
    if (seen.has(line.feeItemId)) out.add("duplicateItem");
    seen.add(line.feeItemId);
  }
  return [...out];
}

export const PAYMENT_REFERENCE_MAX = 60;

export interface ManualPaymentDraft {
  studentId: string;
  amount: string;
  method: string;
  reference: string;
}

/** A manual payment needs a student, a positive amount, a known method, and a reference the receipt can show. */
export function manualPaymentProblems(d: ManualPaymentDraft): string[] {
  const out: string[] = [];
  if (d.studentId === "") out.push("studentRequired");
  if (nairaToKobo(d.amount) === null) out.push("amount");
  if (!(PAYMENT_METHODS as readonly string[]).includes(d.method)) out.push("method");
  const ref = d.reference.trim();
  if (ref === "") out.push("referenceRequired");
  else if (ref.length > PAYMENT_REFERENCE_MAX) out.push("referenceLength");
  return out;
}

export interface AdjustmentDraft {
  kind: string;
  amount: string;
  reason: string;
}

export function adjustmentProblems(d: AdjustmentDraft): string[] {
  const out: string[] = [];
  if (!(ADJUSTMENT_KINDS as readonly string[]).includes(d.kind)) out.push("kind");
  if (nairaToKobo(d.amount) === null) out.push("amount");
  const r = reasonProblem(d.reason);
  if (r) out.push(r);
  return out;
}

/** The status a payment shows a reversal request as, when the server has recorded one. */
export function canRequestReversal(p: { status: string; reversalRequested: boolean }): boolean {
  return p.status !== "Reversed" && !p.reversalRequested;
}
