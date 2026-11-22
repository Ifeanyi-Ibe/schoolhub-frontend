# 0019: Fees and payments (F6): money handling, idempotency and maker-checker

- **Status:** Accepted, 2026-11-21. The staff side is built; the parent slice is not (see PROGRESS F6).

## Context

F6 adds fee structures, discounts, invoices, payments (manual and through the gateway), receipts, reversals with an
approval step, unallocated payments, and reports. Every amount is integer kobo in the contract. A wrong amount or a
payment recorded twice is a money error, so the decisions below are the ones that protect money.

## Decisions

1. **Amounts are integer kobo everywhere.** A naira amount typed on a form is parsed exactly (at most two decimal
   places, no floating point) into kobo, and kobo is formatted with `formatNaira` (Intl NGN, tabular numerals). A value
   that cannot be parsed exactly is refused on the screen, not rounded.
2. **Idempotency keys on the operations the contract declares them on**: manual payment, invoice generation, invoice
   adjustment, discount grant, online payment initialisation, and unallocated assignment. One key per user action,
   reused on every retry of that action. The screens disable the button while a request is pending.
3. **Nothing money-related is updated optimistically.** A payment, a reversal, a void, an adjustment and a generated
   invoice show a pending state until the server has answered, then the server's figures.
4. **Maker-checker for reversals.** A reversal is requested by one person (`fees.payments.reverse`) and approved by
   another (`fees.payments.approve`). The screen shows Approve only on a payment whose `reversalRequested` is true, and
   only to holders of the approve permission. The server refuses a self-approval (403); the screen shows that refusal.
   The screen never assumes who asked: it shows the server's answer.
5. **Online payments are authorised by the gateway.** The screen calls initialise, then navigates to the returned
   `authorizationUrl`. On return it calls verify with the reference and shows the server's status. A payment is never
   shown as paid from the redirect alone.
6. **Invoice and payment status are shown as the server sends them.** The contract leaves them as free strings (B-41).
   The screens label the values the backend uses (Draft, Issued, Paid, Overdue, Void; Pending, Reversed,
   ReversalRequested) and show any other value as it arrives.
7. **Reports read the server's totals.** Collection, debtors and reconciliation are displayed as the API returns them;
   the screens do not recompute totals from rows.
8. **Permissions decide what is shown**, from `GET /me`: `fees.structures.manage`, `fees.invoices.create`,
   `fees.invoices.void`, `fees.payments.record`, `fees.payments.reverse`, `fees.payments.approve`,
   `fees.discounts.approve`, `fees.reports.read`. Never a role name.

## Not in this slice

- The ledger per student and the statement (B-17: the contract has a ledger view, but the statement is not in it).
- Virtual accounts, payment plans and the daily close (B-17).
- Parent screens (wards switcher, pay by card, bank-transfer details with copy buttons, receipts) are a second slice of
  F6, after the staff money screens are verified.
