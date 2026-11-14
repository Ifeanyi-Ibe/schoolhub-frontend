import { describe, expect, it } from "vitest";
import messages from "../../../messages/en.json";
import { invoiceStateKey, type InvoiceStateKey } from "./invoice-state";

const cases: [
  string,
  { status: string; paidKobo: number; balanceKobo: number },
  InvoiceStateKey,
][] = [
  [
    "nothing paid and past due",
    { status: "Overdue", paidKobo: 0, balanceKobo: 5000000 },
    "overdue",
  ],
  [
    "half paid and past due is labelled as part-paid and overdue",
    { status: "Overdue", paidKobo: 2500000, balanceKobo: 2500000 },
    "partPaidOverdue",
  ],
  [
    "half paid and not yet due",
    { status: "Issued", paidKobo: 2500000, balanceKobo: 2500000 },
    "partPaid",
  ],
  ["settled", { status: "Paid", paidKobo: 5000000, balanceKobo: 0 }, "paid"],
  ["void", { status: "Void", paidKobo: 0, balanceKobo: 0 }, "void"],
];

describe("invoiceStateKey", () => {
  it.each(cases)("%s", (_name, input, expected) => {
    expect(invoiceStateKey(input)).toBe(expected);
  });

  it("has a catalogue entry for every key it can return", () => {
    const keys: InvoiceStateKey[] = [
      "paid",
      "partPaid",
      "partPaidOverdue",
      "overdue",
      "issued",
      "void",
      "draft",
      "other",
    ];
    const catalogue =
      (messages as { fees?: { invoiceState?: Record<string, string> } }).fees?.invoiceState ?? {};
    for (const k of keys) expect(catalogue[k], k).toBeTruthy();
  });
});
