"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { refusalText } from "@/features/students/refusal";
import { formatCalendarDate, formatInstant } from "@/lib/format/dates";
import { formatNaira } from "@/lib/format/money";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import {
  BILLING_PAGE_SIZE,
  billingInvoicesQuery,
  payInvoice,
  subscriptionQuery,
  type TenancyPaymentView,
} from "./api";
import { amountLabel, isPayable, PAY_UNAVAILABLE } from "./rules";

export const BILLING_PERMISSION = "settings.manage";

function money(kobo: number, currency: string): string {
  const label = amountLabel(kobo, currency);
  return label.naira ? formatNaira(kobo) : label.text;
}

/** The school's subscription and its invoices, and payment of an invoice (ADR 0025, slice 6). Nothing is shown as paid before the server says so. */
export function BillingView() {
  const t = useTranslations("billing");
  const tState = useTranslations("billing.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [BILLING_PERMISSION]);
  const sub = useQuery({ ...subscriptionQuery(), enabled: allowed });
  const [page, setPage] = useState(1);
  const invoices = useQuery({ ...billingInvoicesQuery(page), enabled: allowed });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payKey, setPayKey] = useState(() => newActionKey());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TenancyPaymentView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (sub.isError || invoices.isError)
    return (
      <ErrorState
        title={t("loadError")}
        onRetry={() => {
          void sub.refetch();
          void invoices.refetch();
        }}
      />
    );

  const items = invoices.data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil(Number(invoices.data?.totalCount ?? 0) / BILLING_PAGE_SIZE),
  );
  const writesAllowed = online;

  async function pay(invoiceId: string | null) {
    setBusy(true);
    setMessage(null);
    setOutcome(null);
    try {
      const answer = await payInvoice(invoiceId, payKey);
      setOutcome(answer);
      setPayingId(null);
      setPayKey(newActionKey());
      await qc.invalidateQueries({ queryKey: ["billing-invoices"] });
      await qc.invalidateQueries({ queryKey: ["billing-subscription"] });
    } catch (err) {
      if (err instanceof ApiError && err.problem.status === PAY_UNAVAILABLE)
        setMessage(t("pay.unavailable"));
      else
        setMessage(
          err instanceof ApiError
            ? refusalText(err, tState)
            : tState("refused", { code: "unknown" }),
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("offline")}
        </p>
      ) : null}
      {sub.data?.suspendedForNonPayment ? (
        <p
          role="alert"
          className="rounded-control bg-danger-surface px-4 py-3 text-sm text-danger-foreground"
        >
          {t("suspended")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("subscription.title")}</h2>
        {sub.isPending && allowed ? <SkeletonList rows={2} label={tState("loading")} /> : null}
        {sub.data ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("subscription.plan")}</dt>
              <dd className="font-semibold">{sub.data.planName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("subscription.price")}</dt>
              <dd className="tabular-nums">{formatNaira(sub.data.planPriceKobo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("subscription.status")}</dt>
              <dd>{sub.data.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("subscription.outstanding")}</dt>
              <dd className="tabular-nums font-semibold">
                {formatNaira(sub.data.outstandingKobo)}
              </dd>
            </div>
            {sub.data.oldestDueOn ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t("subscription.oldestDue")}</dt>
                <dd>{formatCalendarDate(sub.data.oldestDueOn)}</dd>
              </div>
            ) : null}
            {sub.data.graceEndsOn ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t("subscription.graceEnds")}</dt>
                <dd>{formatCalendarDate(sub.data.graceEndsOn)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("invoices.title")}</h2>
        {invoices.isPending && allowed ? <SkeletonList rows={3} label={tState("loading")} /> : null}
        {invoices.data && items.length === 0 ? (
          <EmptyState title={t("invoices.empty.title")} description={t("invoices.empty.body")} />
        ) : null}
        <ul className="flex flex-col gap-3">
          {items.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-col gap-2 rounded-control border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {t("invoices.period", {
                    start: formatCalendarDate(inv.periodStart),
                    due: formatCalendarDate(inv.dueOn),
                  })}
                </p>
                <StatusBadge tone={inv.paidAt ? "success" : "warning"}>{inv.status}</StatusBadge>
              </div>
              <p className="tabular-nums text-sm">{money(inv.amountKobo, inv.currency)}</p>
              <p className="text-xs text-muted-foreground">
                {inv.paidAt
                  ? t("invoices.paid", { when: formatInstant(inv.paidAt) })
                  : t("invoices.unpaid")}
                {inv.paymentReference
                  ? ` · ${t("invoices.reference", { reference: inv.paymentReference })}`
                  : ""}
              </p>
              {isPayable(inv) ? (
                payingId === inv.id ? (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <p className="mr-auto text-sm text-foreground">
                      {t("pay.confirm", { amount: money(inv.amountKobo, inv.currency) })}
                    </p>
                    <Button
                      onClick={() => pay(inv.id)}
                      disabled={!writesAllowed || busy}
                      loading={busy}
                      loadingLabel={t("pay.working")}
                    >
                      {t("pay.now")}
                    </Button>
                    <Button variant="secondary" onClick={() => setPayingId(null)} disabled={busy}>
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setPayingId(inv.id)}
                      disabled={!writesAllowed || busy}
                    >
                      {t("pay.action")}
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
        {invoices.data && totalPages > 1 ? (
          <nav aria-label={t("invoices.pages")} className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("pageOf", { page: String(page), total: String(totalPages) })}
            </p>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              {t("next")}
            </Button>
          </nav>
        ) : null}
      </Card>

      {outcome ? (
        <p role="status" className="text-sm text-foreground">
          {t("pay.result", { status: outcome.invoiceStatus, tenant: outcome.tenantStatus })}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
