"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { useArmOptions } from "@/features/students/arms";
import { lagosToday } from "@/features/staff-members/rules";
import { myAssignmentsQuery } from "@/features/staff-members/api";
import { useAttendanceAccess } from "./access";

/** The teacher's class arms for the current session, the date to take, and the marks still on this device. */
export function AttendanceHomeView() {
  const t = useTranslations("attendance");
  const tState = useTranslations("academics.state");
  const access = useAttendanceAccess();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canReadMark });
  const sessionId = sessions.data?.find((s) => s.isCurrent)?.id ?? sessions.data?.[0]?.id ?? "";
  const mine = useQuery({
    ...myAssignmentsQuery(sessionId),
    enabled: access.canReadMark && sessionId !== "",
  });
  // Arm names need academics.read; without it a class shows as "A class arm" and the register still works.
  const arms = useArmOptions(access.canReadMark);
  const [date, setDate] = useState(lagosToday());

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReadMark)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const classArmIds = [...new Set((mine.data?.assignments ?? []).map((a) => a.classArmId))];
  const labelOf = (id: string) => arms.find((a) => a.id === id)?.label ?? t("home.armFallback");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("home.title")}
        description={t("home.intro")}
        actions={
          <Link
            href="/attendance/reports"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-card hover:border-brand/40"
          >
            {t("home.reports")}
          </Link>
        }
      />

      <Card className="flex flex-col gap-4 sm:max-w-sm">
        <Input
          label={t("home.date")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Card>

      {sessions.isPending || mine.isPending ? (
        <SkeletonList rows={3} label={tState("loading")} />
      ) : classArmIds.length === 0 ? (
        <EmptyState title={t("home.noClassesTitle")} description={t("home.noClassesBody")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classArmIds.map((id) => {
            const label = labelOf(id);
            return (
              <li key={id}>
                <Card className="flex h-full flex-col gap-4">
                  <CardTitle>{label}</CardTitle>
                  <Link
                    href={`/attendance/register?classArmId=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}&arm=${encodeURIComponent(label)}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-sm font-semibold text-on-brand shadow-brand hover:bg-brand/90"
                  >
                    {t("home.takeRegister")}
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
