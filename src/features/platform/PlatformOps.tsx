"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import { runBillingSweep, topUpSms, type SweepReport } from "./api";

/** Runs the billing sweep for every school, after a confirmation. The counts are shown after the server answers (ADR 0026). */
export function BillingSweepCard() {
  const t = useTranslations("platform.sweep");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SweepReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      setReport(await runBillingSweep());
      setConfirming(false);
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem.status === 401 ? t("signedOut") : t("failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-sm text-foreground">{t("confirm")}</p>
          <Button onClick={run} disabled={busy} loading={busy} loadingLabel={t("working")}>
            {t("now")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setConfirming(true)} disabled={busy}>
            {t("action")}
          </Button>
        </div>
      )}
      {report ? (
        <p role="status" className="text-sm text-foreground">
          {t("done", {
            schools: String(report.schools),
            invoices: String(report.invoicesIssued),
            reminders: String(report.remindersSent),
            changes: String(report.statusChanges),
            failed: String(report.failed),
          })}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

/** Adds SMS units to one school, with a reason kept against the credit. One key per attempt (the contract declares it). */
export function SmsTopUpCard({ tenantId }: { tenantId: string }) {
  const t = useTranslations("platform.topUp");
  const [units, setUnits] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [key, setKey] = useState(() => newActionKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const count = Number(units);
  const unitsOk = /^\d+$/.test(units) && count > 0;

  async function submit() {
    setTried(true);
    if (!unitsOk || reason.trim() === "") return;
    setBusy(true);
    setMessage(null);
    try {
      await topUpSms(tenantId, count, reason.trim(), key);
      setKey(newActionKey());
      setUnits("");
      setReason("");
      setTried(false);
      setMessage(t("done", { units: String(count) }));
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem.status === 401
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
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      <Input
        label={t("units")}
        inputMode="numeric"
        value={units}
        onChange={(e) => setUnits(e.target.value)}
        error={tried && !unitsOk ? t("unitsRequired") : undefined}
      />
      <Input
        label={t("reason")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={tried && reason.trim() === "" ? t("reasonRequired") : undefined}
      />
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={submit}
          disabled={busy}
          loading={busy}
          loadingLabel={t("working")}
        >
          {t("action")}
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
