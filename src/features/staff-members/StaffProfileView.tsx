"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatCalendarDate } from "@/features/academics/calendar-format";
import { GENDERS } from "@/features/students/rules";
import { ApiError } from "@/lib/api/unwrap";
import { reactivateStaff, staffQuery } from "./api";
import { useToast } from "@/components/ui/toast";
import { refusalText } from "@/features/students/refusal";
import { useStaffAccess } from "./access";

// Each tab and each dialog is its own chunk, loaded when it is first opened. The overview (the default tab) is
// rendered on the server with the record, so it stays in this chunk.
const EditStaffDialog = lazy(() =>
  import("./EditStaffDialog").then((m) => ({ default: m.EditStaffDialog })),
);
const InviteStaffDialog = lazy(() =>
  import("./InviteStaffDialog").then((m) => ({ default: m.InviteStaffDialog })),
);
const DeactivateStaffDialog = lazy(() =>
  import("./DeactivateStaffDialog").then((m) => ({ default: m.DeactivateStaffDialog })),
);
const AssignmentsPanel = lazy(() =>
  import("./AssignmentsPanel").then((m) => ({ default: m.AssignmentsPanel })),
);
const LeavePanel = lazy(() => import("./LeavePanel").then((m) => ({ default: m.LeavePanel })));

const TABS = ["overview", "assignments", "leave"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<string, StatusTone> = {
  Active: "success",
  OnLeave: "warning",
  Resigned: "neutral",
  Terminated: "danger",
};

/** One staff record: details, the actions the permissions allow, assignments and leave. */
export function StaffProfileView({ id }: { id: string }) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const access = useStaffAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useQuery({ ...staffQuery(id), enabled: access.canRead });
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.canRead)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (staff.isPending) return <SkeletonList rows={4} label={tState("loading")} />;
  if (staff.isError)
    return (
      <ErrorState
        title={tState("errorTitle")}
        description={tState("errorBody")}
        problem={staff.error instanceof ApiError ? staff.error.problem : null}
        onRetry={() => void qc.invalidateQueries({ queryKey: ["staff", id] })}
      />
    );

  const s = staff.data;

  async function reactivate() {
    setReactivating(true);
    setStatusMessage(null);
    try {
      await reactivateStaff(s.id);
      await qc.invalidateQueries({ queryKey: ["staff", s.id] });
      await qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ tone: "success", title: t("status.reactivated") });
    } catch (err) {
      setStatusMessage(refusalText(err, tState));
    } finally {
      setReactivating(false);
    }
  }

  const fullName = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-card border border-border/80 bg-surface p-6 shadow-card sm:p-8">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={fullName} size="lg" className="size-16 text-xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{s.staffNo}</span>
              <span>{s.jobTitle}</span>
              <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>
                {t(`statusLabels.${s.status}`)}
              </StatusBadge>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label={t("tabs.label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul
          role="tablist"
          className="flex min-w-max gap-1 rounded-card border border-border bg-surface p-1 shadow-card"
        >
          {TABS.filter((x) => x !== "assignments" || access.canAssignRead).map((x) => (
            <li key={x} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={tab === x}
                onClick={() => setTab(x)}
                className={`inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${tab === x ? "bg-brand text-on-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {t(`tabs.${x}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <div role="tabpanel" className="flex flex-col gap-6">
        {tab === "overview" ? (
          <Card className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t("tabs.overview")}</CardTitle>
              <div className="flex flex-wrap gap-3">
                {access.writable ? (
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    {t("editDetails")}
                  </Button>
                ) : null}
                {access.canInvite ? (
                  <Button variant="secondary" onClick={() => setInviting(true)}>
                    {t("inviteUser")}
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label={t("fields.dateOfBirth")} value={formatCalendarDate(s.dateOfBirth)} />
              <Field
                label={t("fields.gender")}
                value={
                  (GENDERS as readonly string[]).includes(s.gender)
                    ? t(`genders.${s.gender}`)
                    : s.gender
                }
              />
              <Field label={t("fields.phone")} value={s.phone} />
              <Field label={t("fields.email")} value={s.email ?? null} />
              <Field label={t("fields.address")} value={s.address ?? null} />
              <Field label={t("fields.staffType")} value={t(`types.${s.staffType}`)} />
              <Field
                label={t("fields.employmentType")}
                value={t(`employment.${s.employmentType}`)}
              />
              <Field label={t("fields.department")} value={s.department ?? null} />
              <Field label={t("fields.hireDate")} value={formatCalendarDate(s.hireDate)} />
            </dl>
            {access.canManageUsers ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  onClick={() => setConfirming(true)}
                  disabled={reactivating}
                >
                  {t("status.deactivate")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={reactivate}
                  loading={reactivating}
                  loadingLabel={tState("loading")}
                >
                  {t("status.reactivate")}
                </Button>
                {statusMessage ? (
                  <p role="alert" className="w-full text-sm text-danger-foreground">
                    {statusMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {tab === "assignments" && access.canAssignRead ? (
          <Suspense fallback={<SkeletonList rows={3} label={tState("loading")} />}>
            <AssignmentsPanel staffId={id} />
          </Suspense>
        ) : null}

        {tab === "leave" ? (
          <Suspense fallback={<SkeletonList rows={3} label={tState("loading")} />}>
            <LeavePanel staffId={id} />
          </Suspense>
        ) : null}
      </div>

      {editing ? (
        <Suspense fallback={null}>
          <EditStaffDialog staff={s} onClose={() => setEditing(false)} />
        </Suspense>
      ) : null}
      {confirming ? (
        <Suspense fallback={null}>
          <DeactivateStaffDialog staff={s} onClose={() => setConfirming(false)} />
        </Suspense>
      ) : null}
      {inviting ? (
        <Suspense fallback={null}>
          <InviteStaffDialog
            staffId={s.id}
            staffName={fullName}
            onClose={() => setInviting(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  const t = useTranslations("staffMembers");
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">
        {value === null || value === "" ? t("notRecorded") : value}
      </dd>
    </div>
  );
}
