"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Suspense, lazy, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/unwrap";
import { useStudentAccess } from "./access";
import { StudentOverview } from "./StudentOverview";
import { studentQuery } from "./api";
import { STUDENT_STATUSES } from "./rules";

// Only the overview (the default tab, rendered on the server) is in this chunk. Each other tab is its own chunk,
// fetched the first time it opens, so the profile page's first load stays within the route budget.
const Guardians = lazy(() => import("./StudentRecordTabs").then((m) => ({ default: m.Guardians })));
const Documents = lazy(() => import("./StudentRecordTabs").then((m) => ({ default: m.Documents })));
const Notes = lazy(() => import("./StudentRecordTabs").then((m) => ({ default: m.Notes })));
const Lifecycle = lazy(() => import("./StudentRecordTabs").then((m) => ({ default: m.Lifecycle })));

type StudentStatusKey = (typeof STUDENT_STATUSES)[number];
const TABS = ["overview", "guardians", "documents", "notes", "lifecycle"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<string, StatusTone> = {
  Applicant: "info",
  Active: "success",
  Suspended: "danger",
  Withdrawn: "neutral",
  Transferred: "neutral",
  Graduated: "info",
};

/** One student: details, guardians, documents, notes and status changes. Every change is checked on the server. */
export function StudentProfileView({ id }: { id: string }) {
  const t = useTranslations("students.profile");
  const tState = useTranslations("academics.state");
  const tStatus = useTranslations("students.statusLabels");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const student = useQuery({ ...studentQuery(id), enabled: access.canRead });
  const [tab, setTab] = useState<Tab>("overview");

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.canRead)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;
  if (student.isPending) return <SkeletonList rows={4} label={tState("loading")} />;
  if (student.isError)
    return (
      <ErrorState
        title={tState("errorTitle")}
        description={tState("errorBody")}
        problem={student.error instanceof ApiError ? student.error.problem : null}
        onRetry={() => void qc.invalidateQueries({ queryKey: ["student", id] })}
      />
    );

  const s = student.data;
  const fullName = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-card border border-border/80 bg-surface p-6 shadow-card sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-brand-soft to-transparent opacity-80"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={fullName} size="lg" className="size-16 text-xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{s.admissionNo}</span>
              <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>
                {tStatus(s.status as StudentStatusKey)}
              </StatusBadge>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label={t("overview")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul
          role="tablist"
          className="flex min-w-max gap-1 rounded-card border border-border bg-surface p-1 shadow-card"
        >
          {TABS.filter((x) => x !== "notes" || access.canNotesRead).map((x) => (
            <li key={x} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={tab === x}
                onClick={() => setTab(x)}
                className={`inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${tab === x ? "bg-brand text-on-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {t(x)}
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
        {tab === "overview" ? <StudentOverview student={s} /> : null}
        <Suspense fallback={<SkeletonList rows={3} label={tState("loading")} />}>
          {tab === "guardians" ? <Guardians student={s} /> : null}
          {tab === "documents" ? <Documents studentId={id} /> : null}
          {tab === "notes" && access.canNotesRead ? <Notes studentId={id} /> : null}
          {tab === "lifecycle" ? <Lifecycle student={s} /> : null}
        </Suspense>
      </div>
    </div>
  );
}
