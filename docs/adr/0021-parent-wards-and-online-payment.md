# 0021: Parent wards, invoices and online payment (F6, parent slice)

- **Status:** Accepted, 2026-11-21.

## Context

A parent sees the wards linked to their account, their invoices, and pays by card through the school's gateway. They
also need the school's bank details to pay by transfer. The contract provides the wards, a ward's invoices, online
payment (initialise, then verify by reference), and the payment's receipt. It does not provide bank details, and it does
not list a parent's payments.

## Decisions

1. **Online payment is confirmed by the gateway, never by the redirect.** The screen calls initialise (with an
   Idempotency-Key, one per attempt), then sends the browser to the returned `authorizationUrl`. On return the screen
   calls verify with the reference and shows the server's status. A payment is shown as paid only when the server says
   `Succeeded`. Any other status is shown as not yet confirmed, with a way to check again.
2. **The amount is typed in naira and parsed exactly** (ADR 0019). The contract requires an email for the payment; the
   screen uses the account's email from `GET /me`, and does not start a payment without one.
3. **Payment needs a connection.** The pay button is disabled while offline; the gateway cannot be reached offline.
4. **Bank transfer shows the school's contact, not account numbers.** The contract has no bank details (BACKEND_GAPS
   B-44), so the screen does not invent them. It shows the school's support email and phone (from the tenant summary's
   branding, which the contract provides), and the ward's admission number with a copy button, which the parent quotes
   on the transfer. When the school publishes account details in the contract, the screen will show them with copy
   buttons.
5. **Receipts are reachable from the return screen only.** The contract gives no list of a parent's payments (B-45), so
   a receipt is offered for a payment the parent has just verified. The receipt is downloaded through the BFF.
6. **Wards and invoices are read-only for the parent.** The ward list is `GET /me/wards`; a ward's invoices are
   `GET /me/wards/{id}/invoices`. No statement is shown (B-17).
7. **Parent text uses the light formatter** (ADR 0013): the `wards` namespace is in `LIGHT_MESSAGE_PATHS`, and the
   screens use only the message syntax the light formatter supports. Money is formatted with `formatNaira`.
8. **Permissions decide what is shown**, from `GET /me`: `me.wards` for the wards and invoices, `me.pay` for online
   payment and the receipt. Never a role name.

## Consequences

- A parent cannot review earlier payments in the app. This is a gap to close with the backend (B-45).
- Bank-transfer details are a contact, not an account, until B-44 is closed.
