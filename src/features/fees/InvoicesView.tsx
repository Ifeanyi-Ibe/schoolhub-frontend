"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { academicSessionsQuery, sessionTermsQuery } from "@/features/academics/sessions-api";
import { levelsQuery } from "@/features/academics/api";
import { downloadFromApi } from "@/features/files/download";
import { refusalText } from "@/features/students/refusal";
import { newActionKey } from "@/lib/api/idempotency";
import { formatNaira } from "@/lib/format/money";
import { formatCalendarDate } from "@/lib/format/dates";
import { useFeeAccess } from "./access";
import { FeesTabs } from "./FeesTabs";
import {
  adjustInvoice,
  generateInvoices,
  invoiceQuery,
  invoicesQuery,
  voidInvoice,
  type FeesInvoiceView,
  type GenerateView,
} from "./api";
import { ADJUSTMENT_KINDS, adjustmentProblems, nairaToKobo, reasonProblem } from "./rules";

// Invoice statuses as the backend uses them (BACKEND_GAPS B-41: the contract leaves them free text).
const STATUS_TONE: Record<string, StatusTone> = {
  Draft: "neutral",
  Issued: "info",
  Paid: "success",
  Overdue: "danger",
  Void: "neutral",
};
const STATUSES = ["Draft", "Issued", "Paid", "Overdue", "Void"] as const;

/** Invoices: generate them for a term, find them, and open one to void it, adjust it, or download its PDF. */
export function InvoicesView() {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const access = useFeeAccess();
  const toast = useToast();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const invoices = useQuery({
    ...invoicesQuery({ studentId, termId, status, page }),
    enabled: access.canReports,
  });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReports)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const columns: Column<FeesInvoiceView>[] = [
    { key: "no", header: t("invoices.number"), cell: (i) => i.invoiceNo },
    {
      key: "status",
      header: t("invoices.status"),
      cell: (i) => <StatusBadge tone={STATUS_TONE[i.status] ?? "neutral"}>{i.status}</StatusBadge>,
    },
    { key: "total", header: t("invoices.total"), cell: (i) => formatNaira(Number(i.totalKobo)) },
    {
      key: "balance",
      header: t("invoices.balance"),
      cell: (i) => formatNaira(Number(i.balanceKobo)),
    },
    {
      key: "open",
      header: t("invoices.open"),
      cell: (i) => (
        <Button
          variant="ghost"
          onClick={() => setOpenId(i.id)}
          aria-label={t("invoices.openNumber", { number: i.invoiceNo })}
        >
          {t("invoices.open")}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("invoices.title")} description={t("invoices.intro")} />
      <FeesTabs />
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}

      {access.canInvoiceCreate ? (
        <GenerateSection
          onDone={(result) => {
            setMessage(
              t("invoices.generated", {
                created: Number(result.created),
                skipped: Number(result.skippedExisting),
              }),
            );
            void qc.invalidateQueries({ queryKey: ["fee-invoices"] });
            toast({ tone: "success", title: t("invoices.generatedTitle") });
          }}
        />
      ) : null}

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("invoices.find")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label={t("invoices.studentId")}
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value.trim());
              setPage(1);
            }}
          />
          <Input
            label={t("invoices.termId")}
            value={termId}
            onChange={(e) => {
              setTermId(e.target.value.trim());
              setPage(1);
            }}
          />
          <Select
            label={t("invoices.statusFilter")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("invoices.anyStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {invoices.isPending ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : invoices.data && invoices.data.items.length === 0 ? (
          <EmptyState title={t("invoices.emptyTitle")} description={t("invoices.emptyBody")} />
        ) : invoices.data ? (
          <>
            <ResponsiveTable
              caption={t("invoices.title")}
              columns={columns}
              rows={invoices.data.items}
              rowKey={(i) => i.id}
            />
            <nav
              aria-label={t("invoices.pages")}
              className="flex items-center justify-between gap-3"
            >
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t("previous")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("pageOf", { page, total: Number(invoices.data.totalPages) })}
              </p>
              <Button
                variant="secondary"
                disabled={page >= Number(invoices.data.totalPages)}
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </nav>
          </>
        ) : null}
      </Card>

      {openId !== null ? (
        <InvoiceDetail
          id={openId}
          canVoid={access.canInvoiceVoid}
          canAdjust={access.canInvoiceCreate}
          onClose={() => setOpenId(null)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["fee-invoices"] })}
        />
      ) : null}
    </div>
  );
}

function GenerateSection({ onDone }: { onDone: (result: GenerateView) => void }) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const sessions = useQuery(academicSessionsQuery);
  const [sessionId, setSessionId] = useState("");
  const terms = useQuery({ ...sessionTermsQuery(sessionId), enabled: sessionId !== "" });
  const levels = useQuery(levelsQuery);
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [armId, setArmId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(() => newActionKey());

  async function run(e: FormEvent) {
    e.preventDefault();
    if (termId === "" || (levelId === "" && armId.trim() === "")) {
      setMessage(t("invoices.generateIncomplete"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await generateInvoices(
        {
          termId,
          classLevelId: levelId === "" ? null : levelId,
          classArmId: armId.trim() === "" ? null : armId.trim(),
        },
        key,
      );
      setKey(newActionKey());
      onDone(result);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t("invoices.generate")}</CardTitle>
      <p className="text-sm text-muted-foreground">{t("invoices.generateIntro")}</p>
      <form onSubmit={run} noValidate className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("invoices.session")}
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            setTermId("");
          }}
        >
          <option value="">{t("setup.choose")}</option>
          {(sessions.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          label={t("invoices.term")}
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
        >
          <option value="">{t("setup.choose")}</option>
          {(terms.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <Select
          label={t("invoices.level")}
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
        >
          <option value="">{t("invoices.anyLevel")}</option>
          {(levels.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Input
          label={t("invoices.arm")}
          value={armId}
          onChange={(e) => setArmId(e.target.value)}
          hint={t("invoices.armHint")}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground sm:col-span-2">
            {message}
          </p>
        ) : null}
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
            {t("invoices.generateAction")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function InvoiceDetail({
  id,
  canVoid,
  canAdjust,
  onClose,
  onChanged,
}: {
  id: string;
  canVoid: boolean;
  canAdjust: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const invoice = useQuery(invoiceQuery(id));
  const [voidReason, setVoidReason] = useState("");
  const [adjKind, setAdjKind] = useState<string>(ADJUSTMENT_KINDS[0]);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjKey, setAdjKey] = useState(() => newActionKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  if (invoice.isPending) return <SkeletonList rows={3} label={tState("loading")} />;
  if (invoice.isError)
    return (
      <p role="alert" className="text-sm text-danger-foreground">
        {tState("errorBody")}
      </p>
    );
  const inv = invoice.data;

  async function doVoid() {
    const problem = reasonProblem(voidReason);
    setTried(true);
    if (problem) return;
    setBusy(true);
    setMessage(null);
    try {
      await voidInvoice(id, voidReason.trim());
      toast({ tone: "success", title: t("invoices.voided") });
      onChanged();
      await invoice.refetch();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function doAdjust(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (adjustmentProblems({ kind: adjKind, amount: adjAmount, reason: adjReason }).length > 0)
      return;
    setBusy(true);
    setMessage(null);
    try {
      await adjustInvoice(
        id,
        {
          kind: adjKind as (typeof ADJUSTMENT_KINDS)[number],
          amountKobo: nairaToKobo(adjAmount) ?? 0,
          reason: adjReason.trim(),
        },
        adjKey,
      );
      setAdjKey(newActionKey());
      setAdjAmount("");
      setAdjReason("");
      setTried(false);
      toast({ tone: "success", title: t("invoices.adjusted") });
      onChanged();
      await invoice.refetch();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setMessage(null);
    try {
      await downloadFromApi(
        `/api/v1/invoices/${encodeURIComponent(id)}/pdf`,
        `invoice-${inv.invoiceNo}.pdf`,
      );
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("invoices.detail", { number: inv.invoiceNo })}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("invoices.due", { date: formatCalendarDate(inv.dueDate) })} ·{" "}
            <StatusBadge tone={STATUS_TONE[inv.status] ?? "neutral"}>{inv.status}</StatusBadge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            {t("invoices.pdf")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("invoices.close")}
          </Button>
        </div>
      </div>

      <ResponsiveTable
        caption={t("invoices.lines")}
        columns={[
          { key: "desc", header: t("invoices.line"), cell: (l) => l.description },
          {
            key: "amount",
            header: t("invoices.amount"),
            cell: (l) => formatNaira(Number(l.amountKobo)),
          },
        ]}
        rows={inv.lines}
        rowKey={(l) => l.description}
      />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={t("invoices.subtotal")} value={formatNaira(Number(inv.subtotalKobo))} />
        <Figure label={t("invoices.discount")} value={formatNaira(Number(inv.discountKobo))} />
        <Figure label={t("invoices.adjustment")} value={formatNaira(Number(inv.adjustmentKobo))} />
        <Figure label={t("invoices.paid")} value={formatNaira(Number(inv.paidKobo))} />
        <Figure label={t("invoices.total")} value={formatNaira(Number(inv.totalKobo))} />
        <Figure label={t("invoices.balance")} value={formatNaira(Number(inv.balanceKobo))} />
      </dl>

      {canAdjust && inv.status !== "Void" ? (
        <form
          onSubmit={doAdjust}
          noValidate
          className="grid gap-4 rounded-control border border-border p-4 sm:grid-cols-2"
        >
          <p className="sm:col-span-2 text-sm font-semibold text-foreground">
            {t("invoices.adjust")}
          </p>
          <Select
            label={t("invoices.kind")}
            value={adjKind}
            onChange={(e) => setAdjKind(e.target.value)}
          >
            {ADJUSTMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t("invoices.amountNaira")}
            inputMode="decimal"
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            error={
              tried && nairaToKobo(adjAmount) === null ? t("setup.lineErrors.amount") : undefined
            }
          />
          <Input
            label={t("invoices.reason")}
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            maxLength={300}
            error={tried && reasonProblem(adjReason) ? t("invoices.reasonRequired") : undefined}
          />
          <div className="flex items-end justify-end">
            <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
              {t("invoices.adjustAction")}
            </Button>
          </div>
        </form>
      ) : null}

      {canVoid && inv.status !== "Void" ? (
        <div className="flex flex-col gap-3 rounded-control border border-danger/30 p-4">
          <Input
            label={t("invoices.voidReason")}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            maxLength={300}
            error={tried && reasonProblem(voidReason) ? t("invoices.reasonRequired") : undefined}
          />
          <div className="flex justify-end">
            <Button variant="danger" onClick={doVoid} disabled={busy}>
              {t("invoices.voidAction")}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-background px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-display text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
