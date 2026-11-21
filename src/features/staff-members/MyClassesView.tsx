"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { subjectsQuery } from "@/features/academics/catalogue-api";
import { useArmOptions } from "@/features/students/arms";
import { ApiError } from "@/lib/api/unwrap";
import { myAssignmentsQuery } from "./api";

/** The signed-in teacher's own classes and subjects in one session (GET /me/assignments). */
export function MyClassesView() {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const sessions = useQuery(academicSessionsQuery);
  const [chosen, setChosen] = useState("");
  const sessionId =
    chosen !== ""
      ? chosen
      : (sessions.data?.find((s) => s.isCurrent)?.id ?? sessions.data?.[0]?.id ?? "");
  const mine = useQuery({ ...myAssignmentsQuery(sessionId), enabled: sessionId !== "" });
  // Names come from the academics catalogue; a teacher without academics.read sees the ids' fallback text.
  const arms = useArmOptions(true);
  const subjects = useQuery(subjectsQuery);

  const armLabel = (id: string) =>
    arms.find((a) => a.id === id)?.label ?? t("assignments.armUnknown");
  const subjectName = (id: string | null | undefined) =>
    id === null || id === undefined || id === ""
      ? t("assignments.allSubjects")
      : ((subjects.data ?? []).find((s) => s.id === id)?.name ?? t("assignments.subjectUnknown"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("myClasses.title")} description={t("myClasses.intro")} />
      <Card className="flex flex-col gap-5">
        {sessions.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : (
          <div className="w-full sm:w-64">
            <Select
              label={t("assignments.session")}
              value={sessionId}
              onChange={(e) => setChosen(e.target.value)}
            >
              {(sessions.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {mine.isPending && sessionId !== "" ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : mine.isError ? (
          <ErrorState
            title={tState("errorTitle")}
            description={tState("errorBody")}
            problem={mine.error instanceof ApiError ? mine.error.problem : null}
            onRetry={() => void qc.invalidateQueries({ queryKey: ["my-assignments", sessionId] })}
          />
        ) : (mine.data?.assignments ?? []).length === 0 ? (
          <EmptyState title={t("myClasses.emptyTitle")} description={t("myClasses.emptyBody")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {(mine.data?.assignments ?? []).map((a) => (
              <li
                key={`${a.id}`}
                className="flex flex-wrap items-center gap-3 rounded-control border border-border/80 p-4"
              >
                <p className="text-sm font-semibold text-foreground">{armLabel(a.classArmId)}</p>
                <p className="text-sm text-muted-foreground">{subjectName(a.subjectId)}</p>
                {a.isFormTeacher ? (
                  <StatusBadge tone="info">{t("assignments.formTeacher")}</StatusBadge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
