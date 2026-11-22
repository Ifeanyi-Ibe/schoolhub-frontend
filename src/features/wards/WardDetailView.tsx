"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useLightTranslations } from "@/i18n/light-provider";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { formatCalendarDate } from "@/lib/format/dates";
import { formatNaira } from "@/lib/format/money";
import { holdsAny } from "@/features/staff/rules";
import { admissionForCopy } from "./rules";
import { wardInvoicesQuery, wardQuery, type FeesInvoiceView } from "./api";

// The payment form loads when the parent opens it (ADR 0021), not with the screen.
const CardPayment = lazy(() => import("./CardPayment").then((m) => ({ default: m.CardPayment })));

const STATUS_TONE: Record<string, StatusTone> = {
  Paid: "success",
  Overdue: "danger",
  Issued: "info",
  Draft: "neutral",
  Void: "neutral",
};

/** One ward: the invoices, a card payment, and the school's contact for a bank transfer. */
export function WardDetailView({ id }: { id: string }) {
  const t = useLightTranslations("wards");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, ["me.wards"]);
  const canPay = me.data !== undefined && holdsAny(me.data.permissions, ["me.pay"]);
  const ward = useQuery({ ...wardQuery(id), enabled: allowed });
  const [page, setPage] = useState(1);
  const invoices = useQuery({ ...wardInvoicesQuery(id, page), enabled: allowed });
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const email = me.data?.email ?? "";

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const totalPages = Number(invoices.data?.totalPages ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/wards" className="text-sm font-semibold text-brand underline underline-offset-4">
        {t("back")}
      </Link>
      <PageHeader
        title={ward.data?.fullName ?? "…"}
        description={
          ward.data ? t("relationship", { relationship: ward.data.relationship }) : undefined
        }
      />

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("invoices")}</CardTitle>
        {invoices.isError ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("loadError")}
          </p>
        ) : invoices.data && invoices.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(invoices.data?.items ?? []).map((inv: FeesInvoiceView) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-control border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {t("invoiceNumber", { number: inv.invoiceNo })}
                  </p>
                  <StatusBadge tone={STATUS_TONE[inv.status] ?? "neutral"}>
                    {inv.status}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("due", { date: formatCalendarDate(inv.dueDate) })}
                </p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("total")}</dt>
                    <dd className="tabular-nums">{formatNaira(Number(inv.totalKobo))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("paid")}</dt>
                    <dd className="tabular-nums">{formatNaira(Number(inv.paidKobo))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("balance")}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatNaira(Number(inv.balanceKobo))}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {invoices.data && totalPages > 1 ? (
          <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("pageOf", { page, total: totalPages })}
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

      {canPay ? (
        <Card className="flex flex-col gap-4">
          <CardTitle>{t("pay")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("payIntro")}</p>
          {!online ? (
            <p
              role="status"
              className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
            >
              {t("offlinePay")}
            </p>
          ) : null}
          {paying ? (
            <Suspense fallback={null}>
              <CardPayment studentId={id} email={email} />
            </Suspense>
          ) : (
            <div className="flex justify-end">
              <Button variant="secondary" disabled={!online} onClick={() => setPaying(true)}>
                {t("openPay")}
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("transfer")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("transferIntro")}</p>
        {ward.data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-background px-4 py-3">
            <span className="font-mono text-sm">{admissionForCopy(ward.data.admissionNo)}</span>
            <Button
              variant="secondary"
              onClick={async () => {
                const admission = admissionForCopy(ward.data?.admissionNo ?? "");
                await navigator.clipboard.writeText(admission);
                setMessage(t("copied"));
              }}
            >
              {t("copy")}
            </Button>
          </div>
        ) : null}
        {tenant.data?.branding.supportEmail ? (
          <a
            className="text-sm font-semibold text-brand underline underline-offset-4"
            href={`mailto:${tenant.data.branding.supportEmail}`}
          >
            {t("supportEmail")}
          </a>
        ) : null}
        {tenant.data?.branding.supportPhone ? (
          <a
            className="text-sm font-semibold text-brand underline underline-offset-4"
            href={`tel:${tenant.data.branding.supportPhone}`}
          >
            {t("supportPhone")}
          </a>
        ) : null}
      </Card>

      <span className="sr-only" aria-live="polite">
        {message ?? ""}
      </span>
      <Button
        variant="ghost"
        onClick={() => void qc.invalidateQueries({ queryKey: ["my-ward-invoices", id] })}
      >
        {t("checkAgain")}
      </Button>
    </div>
  );
}
