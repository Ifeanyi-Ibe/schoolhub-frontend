"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { downloadFromApi } from "@/features/files/download";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { refusalText } from "@/features/students/refusal";
import { formatInstant } from "@/lib/format/dates";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import {
  approveDataRequest,
  consentsQuery,
  createDataRequest,
  dataRequestExportPath,
  dataRequestsQuery,
  grantConsent,
  rejectDataRequest,
  startTenantExport,
  tenantExportDownloadPath,
  tenantExportStatus,
  withdrawConsent,
  type DataRequestView,
  type TenantExportView,
} from "./api";
import {
  CHANNELS,
  PURPOSES,
  REQUEST_KINDS,
  isOpenRequest,
  reasonProblem,
  subjectProblem,
} from "./rules";

export const COMPLIANCE_PERMISSION = "compliance.manage";

/** Consents, data requests with maker-checker, and the school's data export (ADR 0025, slice 5). Every decision is shown after the server answers. */
export function ComplianceView() {
  const t = useTranslations("compliance");
  const tState = useTranslations("compliance.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [COMPLIANCE_PERMISSION]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Consents
  const [subjectType, setSubjectType] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [lookup, setLookup] = useState<{ subjectType: string; subjectId: string } | null>(null);
  const consents = useQuery({
    ...consentsQuery(lookup?.subjectType ?? "", lookup?.subjectId ?? "", 1),
    enabled: allowed && lookup !== null,
  });
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>("Messaging");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("Any");
  const [source, setSource] = useState("");
  const [consentTried, setConsentTried] = useState(false);

  // Data requests
  const [statusFilter, setStatusFilter] = useState("");
  const requests = useQuery({ ...dataRequestsQuery(statusFilter, 1), enabled: allowed });
  const [kind, setKind] = useState<(typeof REQUEST_KINDS)[number]>("Export");
  const [reqSubjectType, setReqSubjectType] = useState("");
  const [reqSubjectId, setReqSubjectId] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqTried, setReqTried] = useState(false);
  const [reqKey, setReqKey] = useState(() => newActionKey());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [confirmErase, setConfirmErase] = useState<string | null>(null);

  // Tenant export
  const [exportKey, setExportKey] = useState(() => newActionKey());
  const [exportView, setExportView] = useState<TenantExportView | null>(null);

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const writesAllowed = online;

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ["data-requests"] });
      await qc.invalidateQueries({ queryKey: ["consents"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function grant() {
    setConsentTried(true);
    if (!lookup || source.trim() === "") return;
    await run("grant", async () => {
      await grantConsent({
        subjectType: lookup.subjectType,
        subjectId: lookup.subjectId,
        purpose,
        channel,
        source: source.trim(),
      });
      setMessage(t("consent.granted"));
      setSource("");
      setConsentTried(false);
    });
  }

  async function createRequest() {
    setReqTried(true);
    if (subjectProblem(reqSubjectType, reqSubjectId) !== null || reasonProblem(reqReason) !== null)
      return;
    await run("create", async () => {
      await createDataRequest(
        {
          kind,
          subjectType: reqSubjectType.trim(),
          subjectId: reqSubjectId.trim(),
          reason: reqReason.trim(),
        },
        reqKey,
      );
      setReqKey(newActionKey());
      setReqReason("");
      setReqTried(false);
      setMessage(t("requests.created"));
    });
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (action === "reject") {
      if (rejectNote.trim() === "") return;
      await run(`reject-${id}`, async () => {
        const updated: DataRequestView = await rejectDataRequest(id, rejectNote.trim());
        setRejectingId(null);
        setRejectNote("");
        setMessage(t("requests.decided", { status: updated.status }));
      });
      return;
    }
    await run(`approve-${id}`, async () => {
      const updated = await approveDataRequest(id);
      setConfirmErase(null);
      setMessage(t("requests.decided", { status: updated.status }));
    });
  }

  async function startExport() {
    await run("export", async () => {
      const started = await startTenantExport(exportKey);
      setExportKey(newActionKey());
      setExportView(started);
    });
  }

  async function refreshExport() {
    if (!exportView) return;
    await run("refresh", async () => {
      setExportView(await tenantExportStatus(exportView.id));
    });
  }

  async function download(path: string, fileName: string) {
    setMessage(null);
    try {
      await downloadFromApi(path, fileName);
    } catch {
      setMessage(t("download.failed"));
    }
  }

  const rows = requests.data?.items ?? [];

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

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("consent.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("consent.intro")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("subject.type")}
            hint={t("subject.typeHint")}
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          />
          <Input
            label={t("subject.id")}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() =>
              setLookup({ subjectType: subjectType.trim(), subjectId: subjectId.trim() })
            }
            disabled={subjectProblem(subjectType, subjectId) !== null}
          >
            {t("consent.find")}
          </Button>
        </div>
        {lookup ? (
          <>
            <ul className="flex flex-col gap-2">
              {(consents.data?.items ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm"
                >
                  <span>
                    {t("consent.item", {
                      purpose: c.purpose,
                      channel: c.channel,
                      state: c.active ? t("consent.active") : t("consent.withdrawn"),
                    })}
                  </span>
                  {c.active ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        run(`withdraw-${c.id}`, async () => {
                          await withdrawConsent(c.id);
                          setMessage(t("consent.withdrawnDone"));
                        })
                      }
                      disabled={!writesAllowed || busy !== null}
                    >
                      {t("consent.withdraw")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {consents.data && consents.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("consent.none")}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label={t("consent.purpose")}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as (typeof PURPOSES)[number])}
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Select
                label={t("consent.channel")}
                value={channel}
                onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input
                label={t("consent.source")}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                error={
                  consentTried && source.trim() === "" ? t("consent.sourceRequired") : undefined
                }
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={grant}
                disabled={!writesAllowed || busy !== null}
                loading={busy === "grant"}
                loadingLabel={t("working")}
              >
                {t("consent.grant")}
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("requests.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("requests.intro")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("requests.kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof REQUEST_KINDS)[number])}
          >
            {REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`requests.kinds.${k}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t("subject.type")}
            value={reqSubjectType}
            onChange={(e) => setReqSubjectType(e.target.value)}
            error={
              reqTried && subjectProblem(reqSubjectType, reqSubjectId) === "typeRequired"
                ? t("subject.typeRequired")
                : undefined
            }
          />
          <Input
            label={t("subject.id")}
            value={reqSubjectId}
            onChange={(e) => setReqSubjectId(e.target.value)}
            error={
              reqTried && subjectProblem(reqSubjectType, reqSubjectId) === "idRequired"
                ? t("subject.idRequired")
                : undefined
            }
          />
          <Input
            label={t("requests.reason")}
            value={reqReason}
            onChange={(e) => setReqReason(e.target.value)}
            error={
              reqTried && reasonProblem(reqReason)
                ? t(`reason.${reasonProblem(reqReason)}`)
                : undefined
            }
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={createRequest}
            disabled={!writesAllowed || busy !== null}
            loading={busy === "create"}
            loadingLabel={t("working")}
          >
            {t("requests.create")}
          </Button>
        </div>

        <Select
          label={t("requests.filter")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t("requests.any")}</option>
          <option value="Open">{t("requests.statusOpen")}</option>
        </Select>
        {requests.isPending && allowed ? (
          <SkeletonList rows={3} label={t("state.loading")} />
        ) : null}
        {requests.data && rows.length === 0 ? (
          <EmptyState title={t("requests.empty.title")} description={t("requests.empty.body")} />
        ) : null}
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-control border border-border p-3">
              <p className="text-sm font-medium text-foreground">
                {t("requests.item", {
                  kind: r.kind,
                  subject: r.subjectType,
                  requested: formatInstant(r.requestedAt),
                })}
              </p>
              <p className="text-sm text-foreground">{r.reason}</p>
              <p className="text-xs text-muted-foreground">
                {t("requests.status", { status: r.status, requestedBy: r.requestedBy })}
              </p>
              {r.decidedAt ? (
                <p className="text-xs text-muted-foreground">
                  {t("requests.decidedAt", {
                    when: formatInstant(r.decidedAt),
                    by: r.decidedBy ?? "—",
                    note: r.decisionNote ?? "",
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                {r.hasExport ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      download(dataRequestExportPath(r.id), t("download.exportFileName"))
                    }
                    disabled={busy !== null}
                  >
                    {t("download.export")}
                  </Button>
                ) : null}
                {isOpenRequest(r) ? (
                  <>
                    {rejectingId === r.id ? (
                      <>
                        <Input
                          label={t("requests.rejectNote")}
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                        />
                        <Button
                          variant="secondary"
                          onClick={() => decide(r.id, "reject")}
                          disabled={!writesAllowed || busy !== null || rejectNote.trim() === ""}
                          loading={busy === `reject-${r.id}`}
                          loadingLabel={t("working")}
                        >
                          {t("requests.rejectNow")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setRejectingId(r.id)}
                        disabled={!writesAllowed || busy !== null}
                      >
                        {t("requests.reject")}
                      </Button>
                    )}
                    {r.kind === "Erase" && confirmErase !== r.id ? (
                      <Button
                        onClick={() => setConfirmErase(r.id)}
                        disabled={!writesAllowed || busy !== null}
                      >
                        {t("requests.approve")}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => decide(r.id, "approve")}
                        disabled={!writesAllowed || busy !== null}
                        loading={busy === `approve-${r.id}`}
                        loadingLabel={t("working")}
                      >
                        {r.kind === "Erase" ? t("requests.eraseNow") : t("requests.approve")}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
              {r.kind === "Erase" && confirmErase === r.id ? (
                <p className="text-sm text-danger-foreground">{t("requests.eraseWarning")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("export.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("export.intro")}</p>
        <div className="flex flex-wrap justify-end gap-3">
          {exportView ? (
            <Button
              variant="secondary"
              onClick={refreshExport}
              disabled={busy !== null}
              loading={busy === "refresh"}
              loadingLabel={t("working")}
            >
              {t("export.refresh")}
            </Button>
          ) : null}
          <Button
            onClick={startExport}
            disabled={!writesAllowed || busy !== null}
            loading={busy === "export"}
            loadingLabel={t("working")}
          >
            {t("export.start")}
          </Button>
        </div>
        {exportView ? (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">{t("export.status", { status: exportView.status })}</p>
            {exportView.error ? (
              <p className="text-danger-foreground">
                {t("export.error", { error: exportView.error })}
              </p>
            ) : null}
            {exportView.completedAt && !exportView.error ? (
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() =>
                    download(tenantExportDownloadPath(exportView.id), t("download.zipFileName"))
                  }
                  disabled={busy !== null}
                >
                  {t("download.zip")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
