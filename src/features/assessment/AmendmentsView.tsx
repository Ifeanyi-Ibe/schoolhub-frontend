"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { refusalText } from "@/features/students/refusal";
import { newActionKey } from "@/lib/api/idempotency";
import { useAssessmentAccess } from "./access";
import { armNamesQuery, defaultSchemeQuery, myAssignmentsOnlyQuery, termsQuery } from "./api";
import { classResultsQuery, type ClassKey } from "./results/api";
import {
  approveAmendment,
  rejectAmendment,
  requestAmendment,
  type AmendmentView,
} from "./amendments/api";
import { reopenReasonProblem, scoreProblem } from "./rules";

export const AMEND_REQUEST_PERMISSION = "results.amend.request";
export const AMEND_APPROVE_PERMISSION = "results.amend.approve";

/**
 * Amendments to a published result (ADR 0024, slice 5). A requester sends the change and is given its reference; an approver
 * enters the reference to approve or reject it. The contract lists no amendments, so the reference is the only handle (B-47).
 */
export function AmendmentsView() {
  const t = useTranslations("amendments");
  const tState = useTranslations("results.state");
  const access = useAssessmentAccess();
  const online = useOnline();

  const assignments = useQuery(myAssignmentsOnlyQuery());
  const sessionId = assignments.data?.sessionId ?? "";
  const terms = useQuery({ ...termsQuery(sessionId), enabled: sessionId !== "" });
  const arms = useQuery(armNamesQuery());
  const scheme = useQuery(defaultSchemeQuery());
  const [termChoice, setTermChoice] = useState("");
  const [armChoice, setArmChoice] = useState("");
  const current = terms.data?.find((x) => x.isCurrent) ?? terms.data?.[0];
  const termId = termChoice || current?.id || "";
  const armOptions: Array<{ id: string; name: string }> = access.canApprove
    ? [...(arms.data?.entries() ?? [])].map(([id, name]) => ({ id, name }))
    : [...new Set((assignments.data?.assignments ?? []).map((a) => a.classArmId))].map((id) => ({
        id,
        name: arms.data?.get(id) ?? "",
      }));
  const classArmId = armOptions.some((o) => o.id === armChoice)
    ? armChoice
    : (armOptions[0]?.id ?? "");
  const key: ClassKey | null = termId && classArmId ? { termId, classArmId } : null;
  const classRows = useQuery({
    ...classResultsQuery(key ?? { termId: "", classArmId: "" }),
    enabled: key !== null,
  });

  const [studentChoice, setStudentChoice] = useState("");
  const [subjectChoice, setSubjectChoice] = useState("");
  const [componentChoice, setComponentChoice] = useState("");
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [requestKey, setRequestKey] = useState(() => newActionKey());
  const [issued, setIssued] = useState<AmendmentView | null>(null);

  const [reference, setReference] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [decided, setDecided] = useState<AmendmentView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (access.failed) return <ErrorState title={t("loadError")} />;
  if (!access.canRequest && !access.canApproveAmend)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const rows = classRows.data ?? [];
  const student = rows.find((r) => r.studentId === studentChoice) ?? rows[0];
  const subjects = student?.subjects ?? [];
  const subject = subjects.find((s) => s.subjectId === subjectChoice) ?? subjects[0];
  const components = [...(scheme.data?.components ?? [])].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );
  const component = components.find((c) => c.id === componentChoice) ?? components[0];
  const scoreProb = component ? scoreProblem(score, Number(component.maxScore), false) : null;
  const reasonProb = reopenReasonProblem(reason);
  const writesAllowed = online;

  async function request() {
    setTried(true);
    if (
      !key ||
      !student ||
      !subject ||
      !component ||
      scoreProb ||
      score.trim() === "" ||
      reasonProb
    )
      return;
    setBusy("request");
    setMessage(null);
    try {
      const made = await requestAmendment(
        {
          termId: key.termId,
          classArmId: key.classArmId,
          studentId: student.studentId,
          subjectId: subject.subjectId,
          componentId: component.id,
          score: score.trim(),
          reason: reason.trim(),
        },
        requestKey,
      );
      setIssued(made);
      setRequestKey(newActionKey());
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setMessage(null);
    try {
      const answer =
        kind === "approve"
          ? await approveAmendment(reference.trim())
          : await rejectAmendment(reference.trim(), decisionReason.trim());
      setDecided(answer);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
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

      {access.canRequest ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("request.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("request.intro")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("pick.class")}
              value={classArmId}
              onChange={(e) => setArmChoice(e.target.value)}
            >
              {armOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("pick.term")}
              value={termId}
              onChange={(e) => setTermChoice(e.target.value)}
            >
              {(terms.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("request.student")}
              value={student?.studentId ?? ""}
              onChange={(e) => setStudentChoice(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.studentId} value={r.studentId}>
                  {r.studentName}
                </option>
              ))}
            </Select>
            <Select
              label={t("request.subject")}
              value={subject?.subjectId ?? ""}
              onChange={(e) => setSubjectChoice(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </option>
              ))}
            </Select>
            <Select
              label={t("request.component")}
              value={component?.id ?? ""}
              onChange={(e) => setComponentChoice(e.target.value)}
            >
              {components.map((c) => (
                <option key={c.id} value={c.id}>{`${c.name} (${c.maxScore})`}</option>
              ))}
            </Select>
            <Input
              label={t("request.score")}
              inputMode="decimal"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              error={
                tried && score.trim() === ""
                  ? t("request.scoreRequired")
                  : tried && scoreProb
                    ? t(`problem.${scoreProb}`, { max: String(component?.maxScore ?? "") })
                    : undefined
              }
            />
          </div>
          <Input
            label={t("request.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tried && reasonProb ? t(`reason.${reasonProb}`) : undefined}
          />
          <div className="flex justify-end">
            <Button
              onClick={request}
              disabled={!key || !writesAllowed || busy !== null || rows.length === 0}
              loading={busy === "request"}
              loadingLabel={t("saving")}
            >
              {t("request.action")}
            </Button>
          </div>
          {issued ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-control bg-background px-4 py-3 text-sm"
            >
              <p className="text-foreground">{t("request.issued", { status: issued.status })}</p>
              <p className="font-mono text-sm" aria-label={t("request.referenceLabel")}>
                {issued.id}
              </p>
              <p className="text-muted-foreground">{t("request.give")}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {access.canApproveAmend ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("decide.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("decide.intro")}</p>
          <Input
            label={t("decide.reference")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Input
            label={t("decide.reason")}
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => decide("reject")}
              disabled={
                !writesAllowed ||
                busy !== null ||
                reference.trim() === "" ||
                reasonProblemOf(decisionReason) !== null
              }
              loading={busy === "reject"}
              loadingLabel={t("saving")}
            >
              {t("decide.reject")}
            </Button>
            <Button
              onClick={() => decide("approve")}
              disabled={!writesAllowed || busy !== null || reference.trim() === ""}
              loading={busy === "approve"}
              loadingLabel={t("saving")}
            >
              {t("decide.approve")}
            </Button>
          </div>
          {decided ? (
            <p role="status" className="text-sm text-foreground">
              {t("decide.result", { status: decided.status })}
            </p>
          ) : null}
        </Card>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function reasonProblemOf(text: string): string | null {
  return reopenReasonProblem(text);
}
