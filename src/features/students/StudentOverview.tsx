"use client";

// The profile's sections. Each loads when its tab is opened (see StudentProfileView), so the profile page's first
// load does not include the forms, dialogs and tables of the sections the user has not opened.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

import { useToast } from "@/components/ui/toast";
import { formatCalendarDate } from "@/features/academics/calendar-format";

import { lazy, Suspense } from "react";

const DeleteStudentDialog = lazy(() =>
  import("./DeleteStudentDialog").then((m) => ({ default: m.DeleteStudentDialog })),
);
const EditDetails = lazy(() =>
  import("./EditStudentDialog").then((m) => ({ default: m.EditDetails })),
);

import { useStudentAccess } from "./access";
import { type StudentView } from "./api";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-background px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-foreground">
        {value && value !== "" ? value : "—"}
      </dd>
    </div>
  );
}

export function StudentOverview({ student: s }: { student: StudentView }) {
  const t = useTranslations("students.profile");
  const tDetails = useTranslations("students.profile.details");
  const tField = useTranslations("students.field");
  const tState = useTranslations("academics.state");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("overview")}</CardTitle>
          {access.writable ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          ) : null}
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label={tDetails("admissionNo")} value={s.admissionNo} />
          <Field label={tDetails("dateOfBirth")} value={formatCalendarDate(s.dateOfBirth)} />
          <Field label={tDetails("gender")} value={s.gender} />
          <Field label={tDetails("admittedOn")} value={formatCalendarDate(s.admittedOn)} />
          <Field label={tDetails("address")} value={s.address} />
          <Field label={tDetails("status")} value={s.status} />
        </dl>
        {access.canSensitive ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={tField("medicalNotes")} value={s.medicalNotes} />
            <Field label={tField("specialNeedsNotes")} value={s.specialNeedsNotes} />
          </dl>
        ) : (
          <p className="rounded-control bg-background px-4 py-3 text-sm text-muted-foreground">
            {t("sensitiveLocked")}
          </p>
        )}
      </Card>

      {access.canDelete ? (
        <Card className="flex flex-col gap-3 border-danger/30">
          <CardTitle>{t("delete")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
          <div>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              {t("deleteConfirm")}
            </Button>
          </div>
        </Card>
      ) : null}

      {editing ? (
        <Suspense fallback={null}>
          <EditDetails
            student={s}
            onClose={() => setEditing(false)}
            onSaved={async () => {
              toast({ tone: "success", title: tState("saved") });
              await qc.invalidateQueries({ queryKey: ["student", s.id] });
              await qc.invalidateQueries({ queryKey: ["students"] });
              setEditing(false);
            }}
          />
        </Suspense>
      ) : null}

      {deleting ? (
        <Suspense fallback={null}>
          <DeleteStudentDialog student={s} onClose={() => setDeleting(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
