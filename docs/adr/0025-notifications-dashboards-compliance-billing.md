# 0025: Notifications, dashboards, compliance, billing and platform administration (F8)

- **Status:** Accepted, 2026-11-23. Slices 1 (the staff inbox and notification preferences) and 2 (announcements) are built.

## Context

F8 covers about fifty contract operations: the in-app inbox and preferences, templates and previews, announcements with an audience
preview and a cost estimate, the message log with retries and statistics, the SMS wallet, dashboards, consents, data requests and
tenant export, billing (subscription, invoices and payment), the platform administration area with its own sign-in and MFA, audit
export, and the parent's polish. The work is too large for one change, so it is split into slices that each pass the gates.

## Decisions

1. **Slices, in this order.** (1) The staff inbox and notification preferences. (2) Announcements: list, create and edit, audience
   preview, send, cancel. (3) Templates with preview, the message log with retry, statistics and the SMS wallet. (4) Dashboards: the
   admin dashboard from `GET /dashboard/admin`; teacher, bursar and parent dashboards composed from existing reads (B-15, B-16).
   (5) Compliance: consents, data requests with approval, tenant export. (6) Billing: subscription, invoices and payment, which is a
   money flow and waits for its own review. (7) Platform administration, in its own area with its own sign-in and MFA. (8) Audit
   export. (9) The parent's inbox, dashboard and preferences, once the parent budget has room (decision 4).
2. **Money is integer kobo everywhere** (ADR 0019). An announcement's cost estimate and the SMS wallet are shown exactly as the
   server sends them, and are never recomputed on the screen.
3. **Sending and paying are never optimistic.** An announcement sent, a payment, a retry and a data-request decision show a pending
   state until the server answers.
4. **The parent's inbox waits for the budget.** The inbox needs the light formatter (ADR 0013), and the light catalogue is shipped on
   every parent route. The wards detail page is within 85 bytes of its cap, so the parent inbox is not added until that page has room.
   Until then the inbox is staff-only.
5. **Permissions decide what is shown**, from `GET /me`: `me.notifications` for the inbox and preferences; the others as the contract
   declares them. Never a role name.
6. **The shell's navigation is not extended for a single screen.** A navigation item is shared by every signed-in route, and the
   parent group had 51 bytes of headroom under its cap when the inbox item was tried. The inbox item was removed again, and the
   inbox is reached from the results screen's related pages. A navigation design that fits the budget is a later decision.

## Consequences

- The inbox is reached from the results screen and not from the navigation, and not at all from the parent's side. Both are known gaps (decisions 4 and 6).
- Billing stays out of the first slices, so the money-flow review for it is a separate checkpoint.
