# 0026: The school's billing and the payment of its invoices (F8, slice 6)

- **Status:** Accepted, 2026-11-24. The money-flow review was approved by the user on 2026-11-24.

## Context

A school pays SchoolHub for its subscription through invoices. The contract provides the subscription, the invoices, and a payment
that answers at once with the invoice's and the school's new status. Unlike a family's card payment (ADR 0021), there is no
redirect to a gateway on this screen.

## Decisions

1. **Money is integer kobo.** The plan price, the invoice amounts and the amount owed come from the server as kobo and are shown with
   the shared naira formatter. An invoice in a currency the screen does not format is shown with its currency code, never as naira.
2. **One Idempotency-Key per payment attempt**, reused on every retry of that attempt and replaced after the server answers. The
   contract declares the key on this operation.
3. **Nothing is shown as paid until the server answers.** The screen shows the invoice's status and the school's status as the
   server returns them. The invoice list is re-read after the answer.
4. **A payment is confirmed before it is sent**, with the amount named, and only an unpaid invoice can be paid.
5. **An unavailable payment service is reported as such.** A 503 answer says that nothing was paid and that the school should try again.
   Other refusals show the server's code, as elsewhere.
6. **Payment is not run against the real backend.** A check of the real backend reads the subscription and invoices only. The payment
   path is covered by the test double, because a real payment moves real money.
7. **Access follows `settings.manage`**, read from `GET /me`. The screen does not check a role name.

## Decisions on the open points (2026-11-24)

- **Pay without naming an invoice:** not offered. The screen pays the invoice the administrator chose, so the amount on the screen is the amount paid. The contract still accepts a missing id; the screen never sends one.
- **Second confirmation of the payment before the school is shown as active:** not added. The server's answer is the source of truth, and the screen shows the server's invoice and school status as they are. A second call would repeat that answer.
- **Suspension banner links to billing:** decided yes. The banner is part of the shell, so the link waits for room in the shell's budget (see ADR 0027); until then billing is reached from the related pages.

The money-flow review itself is a sign-off by the user. These decisions are recorded for that review; they do not replace it.
