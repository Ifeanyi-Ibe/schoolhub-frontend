"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/unwrap";
import { formatInstant } from "@/lib/format/dates";
import { formatNaira } from "@/lib/format/money";
import {
  platformMetricsQuery,
  platformTenantQuery,
  platformTenantsQuery,
  reactivateTenant,
  suspendTenant,
  type TenantStatus,
} from "./api";
import { usePlatformData } from "./usePlatformData";

const STATUSES: TenantStatus[] = ["Trial", "Active", "PastDue", "Suspended", "Cancelled"];

/** An expired platform session is shown as a request to sign in again, never as a school error. */
function isSessionEnded(err: unknown): boolean {
  return err instanceof ApiError && err.problem.status === 401;
}

/** Money from the platform is integer kobo; a value that cannot be shown exactly is a dash. */
function naira(kobo: number): string {
  return Number.isSafeInteger(kobo) ? formatNaira(kobo) : "—";
}

export function PlatformTenantsView() {
  const t = useTranslations("platform.tenants");
  const tStatus = useTranslations("platform.status");
  const [status, setStatus] = useState<TenantStatus | "">("");
  const [page, setPage] = useState(1);
  const tenants = usePlatformData(
    () => platformTenantsQuery(status, page).queryFn(),
    `${status}|${page}`,
  );

  if (tenants.error && isSessionEnded(tenants.error)) return <SignInAgain />;
  if (tenants.error) return <ErrorState title={t("loadError")} onRetry={tenants.reload} />;
  const items = tenants.data?.items ?? [];
  const totalPages = Number(tenants.data?.totalPages ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <Card className="flex flex-col gap-4">
        <Select
          label={t("status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TenantStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("anyStatus")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
      </Card>
      {tenants.loading ? <SkeletonList rows={4} label={t("loading")} /> : null}
      {tenants.data && items.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.body")} />
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((tn) => (
          <li key={tn.id}>
            <Link
              href={`/platform/tenants/${encodeURIComponent(tn.id)}`}
              className="flex flex-col gap-1 rounded-card border border-border p-4 hover:border-brand/40"
            >
              <span className="text-sm font-semibold text-foreground">{tn.name}</span>
              <span className="text-xs text-muted-foreground">
                {t("row", { slug: tn.slug, status: tStatus(tn.status), plan: tn.planCode })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {tenants.data && totalPages > 1 ? (
        <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
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
    </div>
  );
}

export function PlatformTenantView({ id }: { id: string }) {
  const t = useTranslations("platform.tenant");
  const tStatus = useTranslations("platform.status");
  const tenant = usePlatformData(() => platformTenantQuery(id).queryFn(), id);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (tenant.error && isSessionEnded(tenant.error)) return <SignInAgain />;
  if (tenant.error) return <ErrorState title={t("loadError")} onRetry={tenant.reload} />;
  const tn = tenant.data;

  async function change(action: "suspend" | "reactivate") {
    setTried(true);
    if (action === "suspend" && reason.trim() === "") return;
    setBusy(true);
    setMessage(null);
    try {
      if (action === "suspend") await suspendTenant(id, reason.trim());
      else await reactivateTenant(id);
      setReason("");
      setTried(false);
      setMessage(t(`done.${action}`));
      tenant.reload();
    } catch (err) {
      setMessage(
        isSessionEnded(err)
          ? t("signedOut")
          : t("refused", {
              code: err instanceof ApiError ? (err.problem.code ?? "unknown") : "unknown",
            }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/platform/tenants"
        className="text-sm font-semibold text-brand underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <PageHeader
        title={tn?.name ?? "…"}
        description={tn ? t("summary", { slug: tn.slug, status: tStatus(tn.status) }) : undefined}
      />
      {tn ? (
        <Card className="flex flex-col gap-3 text-sm">
          <p>{t("plan", { plan: tn.planCode })}</p>
          <p>{t("created", { when: formatInstant(tn.createdAt) })}</p>
          {tn.statusReason ? <p>{t("reason", { reason: tn.statusReason })}</p> : null}
        </Card>
      ) : (
        <SkeletonList rows={2} label={t("loading")} />
      )}
      {tn && tn.status !== "Suspended" && tn.status !== "Cancelled" ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("suspend.title")}</h2>
          <Input
            label={t("suspend.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tried && reason.trim() === "" ? t("suspend.reasonRequired") : undefined}
          />
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => change("suspend")}
              disabled={busy}
              loading={busy}
              loadingLabel={t("working")}
            >
              {t("suspend.action")}
            </Button>
          </div>
        </Card>
      ) : null}
      {tn && tn.status === "Suspended" ? (
        <Card className="flex justify-end">
          <Button
            onClick={() => change("reactivate")}
            disabled={busy}
            loading={busy}
            loadingLabel={t("working")}
          >
            {t("reactivate")}
          </Button>
        </Card>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function PlatformMetricsView() {
  const t = useTranslations("platform.metrics");
  const metrics = usePlatformData(() => platformMetricsQuery().queryFn(), "metrics");

  if (metrics.error && isSessionEnded(metrics.error)) return <SignInAgain />;
  if (metrics.error) return <ErrorState title={t("loadError")} onRetry={metrics.reload} />;
  const m = metrics.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {!m ? (
        <SkeletonList rows={3} label={t("loading")} />
      ) : (
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("mrr")}</dt>
              <dd className="tabular-nums font-semibold">{naira(m.monthlyRecurringRevenueKobo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("churn")}</dt>
              <dd className="tabular-nums">{String(m.churnedLast30Days)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("openInvoices")}</dt>
              <dd className="tabular-nums">{String(m.openInvoices)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("openKobo")}</dt>
              <dd className="tabular-nums">{naira(m.openInvoicesKobo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("overdue")}</dt>
              <dd className="tabular-nums">{String(m.overdueInvoices)}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}

function SignInAgain() {
  const t = useTranslations("platform.session");
  return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState title={t("title")} description={t("body")} />
      <Link
        href="/platform/sign-in"
        className="text-sm font-semibold text-brand underline underline-offset-4"
      >
        {t("action")}
      </Link>
    </div>
  );
}
