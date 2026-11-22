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
import { downloadFromApi } from "@/features/files/download";
import { refusalText } from "@/features/students/refusal";
import { ApiError } from "@/lib/api/unwrap";
import { newActionKey } from "@/lib/api/idempotency";
import { formatNaira } from "@/lib/format/money";
import { formatInstant } from "@/lib/format/dates";
import { useFeeAccess } from "./access";
import { FeesTabs } from "./FeesTabs";
import {
  approveReversal,
  assignUnallocated,
  paymentsQuery,
  recordManualPayment,
  requestReversal,
  unallocatedQuery,
  type FeesPaymentView,
  type UnallocatedView,
} from "./api";
import { PAYMENT_METHODS, manualPaymentProblems, nairaToKobo, reasonProblem } from "./rules";

// Payment statuses as the backend uses them (BACKEND_GAPS B-41: the contract leaves them free text).
const STATUS_TONE: Record<string, StatusTone> = {
  Pending: "warning",
  Succeeded: "success",
  Reversed: "neutral",
  ReversalRequested: "danger",
  Failed: "danger",
};

/**
 * Payments: record one made at the school, request a reversal, approve someone else's reversal request (maker-checker),
 * download a receipt, and assign unallocated payments to a student. The server decides every rule and says who may.
 */
export function PaymentsView() {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const access = useFeeAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [unPage, setUnPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const payments = useQuery({
    ...paymentsQuery({ studentId, status, page }),
    enabled: access.canReports,
  });
  const unallocated = useQuery({ ...unallocatedQuery(unPage), enabled: access.canReports });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReports)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["fee-payments"] });
    void qc.invalidateQueries({ queryKey: ["fee-unallocated"] });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("payments.title")} description={t("payments.intro")} />
      <FeesTabs />
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}

      {access.canRecordPayment ? (
        <RecordPayment
          onDone={() => {
            setMessage(t("payments.recorded"));
            refresh();
            toast({ tone: "success", title: t("payments.recordedTitle") });
          }}
        />
      ) : null}

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("payments.list")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("payments.studentId")}
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value.trim());
              setPage(1);
            }}
          />
          <Select
            label={t("payments.statusFilter")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("payments.anyStatus")}</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {payments.isPending ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : payments.data && payments.data.items.length === 0 ? (
          <EmptyState title={t("payments.emptyTitle")} description={t("payments.emptyBody")} />
        ) : payments.data ? (
          <>
            <ResponsiveTable
              caption={t("payments.list")}
              columns={paymentColumns(t, access, setMessage, refresh)}
              rows={payments.data.items}
              rowKey={(p) => p.id}
            />
            <nav
              aria-label={t("payments.pages")}
              className="flex items-center justify-between gap-3"
            >
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t("previous")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("pageOf", { page, total: Number(payments.data.totalPages) })}
              </p>
              <Button
                variant="secondary"
                disabled={page >= Number(payments.data.totalPages)}
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </nav>
          </>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("payments.unallocated")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("payments.unallocatedIntro")}</p>
        {unallocated.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : unallocated.data && unallocated.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("payments.noUnallocated")}</p>
        ) : unallocated.data ? (
          <>
            <ResponsiveTable
              caption={t("payments.unallocated")}
              columns={unallocatedColumns(t, access, refresh, setMessage)}
              rows={unallocated.data.items}
              rowKey={(u) => u.id}
            />
            <nav
              aria-label={t("payments.pages")}
              className="flex items-center justify-between gap-3"
            >
              <Button
                variant="secondary"
                disabled={unPage <= 1}
                onClick={() => setUnPage(unPage - 1)}
              >
                {t("previous")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("pageOf", { page: unPage, total: Number(unallocated.data.totalPages) })}
              </p>
              <Button
                variant="secondary"
                disabled={unPage >= Number(unallocated.data.totalPages)}
                onClick={() => setUnPage(unPage + 1)}
              >
                {t("next")}
              </Button>
            </nav>
          </>
        ) : null}
      </Card>
    </div>
  );
}

type PaymentsT = ReturnType<typeof useTranslations<"fees">>;

function paymentColumns(
  t: PaymentsT,
  access: ReturnType<typeof useFeeAccess>,
  setMessage: (m: string | null) => void,
  refresh: () => void,
): Column<FeesPaymentView>[] {
  return [
    { key: "receipt", header: t("payments.receipt"), cell: (p) => p.receiptNo ?? "—" },
    { key: "amount", header: t("payments.amount"), cell: (p) => formatNaira(Number(p.amountKobo)) },
    { key: "reference", header: t("payments.reference"), cell: (p) => p.reference },
    { key: "method", header: t("payments.method"), cell: (p) => p.method },
    {
      key: "status",
      header: t("payments.status"),
      cell: (p) => <StatusBadge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</StatusBadge>,
    },
    {
      key: "paid",
      header: t("payments.paidAt"),
      cell: (p) => (p.paidAt ? formatInstant(p.paidAt) : "—"),
    },
    {
      key: "actions",
      header: t("payments.actions"),
      cell: (p) => (
        <PaymentActions
          payment={p}
          t={t}
          access={access}
          setMessage={setMessage}
          refresh={refresh}
        />
      ),
    },
  ];
}

function PaymentActions({
  payment,
  t,
  access,
  setMessage,
  refresh,
}: {
  payment: FeesPaymentView;
  t: PaymentsT;
  access: ReturnType<typeof useFeeAccess>;
  setMessage: (m: string | null) => void;
  refresh: () => void;
}) {
  const tState = useTranslations("academics.state");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (reasonProblem(reason)) return;
    setBusy(true);
    try {
      await requestReversal(payment.id, reason.trim());
      setAsking(false);
      setReason("");
      setMessage(t("payments.reversalRequested"));
      refresh();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await approveReversal(payment.id);
      setMessage(t("payments.reversalApproved"));
      refresh();
    } catch (err) {
      // The server refuses the requester approving their own request; that gets its own words.
      const own = err instanceof ApiError && err.problem.code === "fees.maker_checker";
      setMessage(own ? t("payments.selfApproval") : refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function receipt() {
    try {
      await downloadFromApi(
        `/api/v1/payments/${encodeURIComponent(payment.id)}/receipt`,
        `receipt-${payment.receiptNo ?? payment.id}.pdf`,
      );
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={receipt}>
          {t("payments.downloadReceipt")}
        </Button>
        {access.canReverse && payment.status !== "Reversed" && !payment.reversalRequested ? (
          <Button variant="ghost" onClick={() => setAsking(!asking)} aria-expanded={asking}>
            {t("payments.requestReversal")}
          </Button>
        ) : null}
        {access.canApproveReversal && payment.reversalRequested ? (
          <Button variant="secondary" onClick={approve} disabled={busy}>
            {t("payments.approveReversal")}
          </Button>
        ) : null}
      </div>
      {payment.reversalRequested ? (
        <p className="text-xs text-muted-foreground">{t("payments.awaitingApproval")}</p>
      ) : null}
      {asking ? (
        <div className="flex flex-col gap-2">
          <Input
            label={t("payments.reversalReason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
          <Button onClick={ask} disabled={busy || reasonProblem(reason) !== null}>
            {t("payments.sendRequest")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function unallocatedColumns(
  t: PaymentsT,
  access: ReturnType<typeof useFeeAccess>,
  refresh: () => void,
  setMessage: (m: string | null) => void,
): Column<UnallocatedView>[] {
  return [
    { key: "amount", header: t("payments.amount"), cell: (u) => formatNaira(Number(u.amountKobo)) },
    { key: "reference", header: t("payments.reference"), cell: (u) => u.reference },
    { key: "received", header: t("payments.receivedAt"), cell: (u) => formatInstant(u.receivedAt) },
    {
      key: "assign",
      header: t("payments.assign"),
      cell: (u) =>
        access.canRecordPayment && u.isOpen ? (
          <AssignForm id={u.id} t={t} refresh={refresh} setMessage={setMessage} />
        ) : (
          "—"
        ),
    },
  ];
}

function AssignForm({
  id,
  t,
  refresh,
  setMessage,
}: {
  id: string;
  t: PaymentsT;
  refresh: () => void;
  setMessage: (m: string | null) => void;
}) {
  const tState = useTranslations("academics.state");
  const [studentId, setStudentId] = useState("");
  const [key, setKey] = useState(() => newActionKey());
  const [busy, setBusy] = useState(false);

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (studentId.trim() === "") return;
    setBusy(true);
    try {
      await assignUnallocated(id, studentId.trim(), key);
      setKey(newActionKey());
      setStudentId("");
      setMessage(t("payments.assigned"));
      refresh();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={assign} className="flex flex-col gap-2">
      <Input
        label={t("payments.studentIdShort")}
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
      />
      <Button type="submit" variant="secondary" loading={busy} loadingLabel={tState("loading")}>
        {t("payments.assignAction")}
      </Button>
    </form>
  );
}

function RecordPayment({ onDone }: { onDone: () => void }) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(() => newActionKey());
  const problems = manualPaymentProblems({ studentId, amount, method, reference });

  async function record(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordManualPayment(
        {
          studentId: studentId.trim(),
          amountKobo: nairaToKobo(amount) ?? 0,
          method,
          reference: reference.trim(),
          paidOn: paidOn === "" ? null : paidOn,
        },
        key,
      );
      setKey(newActionKey());
      setAmount("");
      setReference("");
      setTried(false);
      onDone();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t("payments.record")}</CardTitle>
      <p className="text-sm text-muted-foreground">{t("payments.recordIntro")}</p>
      <form onSubmit={record} noValidate className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t("payments.studentId")}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value.trim())}
          error={
            tried && problems.includes("studentRequired")
              ? t("payments.studentRequired")
              : undefined
          }
        />
        <Input
          label={t("payments.amountNaira")}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={tried && problems.includes("amount") ? t("setup.lineErrors.amount") : undefined}
        />
        <Select
          label={t("payments.method")}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t("payments.reference")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          maxLength={60}
          error={
            tried && problems.includes("referenceRequired")
              ? t("payments.referenceRequired")
              : undefined
          }
        />
        <Input
          label={t("payments.paidOn")}
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          hint={t("payments.paidOnHint")}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground sm:col-span-2">
            {message}
          </p>
        ) : null}
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
            {t("payments.recordAction")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
