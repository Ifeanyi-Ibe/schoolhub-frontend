"use client";

// The profile's sections. Each loads when its tab is opened (see StudentProfileView), so the profile page's first
// load does not include the forms, dialogs and tables of the sections the user has not opened.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatCalendarDate } from "@/features/academics/calendar-format";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { uploadFile, UploadRefused } from "@/features/files/upload";
import { refusalText } from "./refusal";
import { useArmOptions } from "./arms";
import { useStudentAccess } from "./access";
import {
  addDocument,
  addGuardian,
  addNote,
  graduateStudent,
  inviteGuardian,
  leaveStudent,
  reinstateStudent,
  removeDocument,
  removeGuardian,
  studentDocumentsQuery,
  studentNotesQuery,
  transferStudentArm,
  type StudentView,
} from "./api";
import {
  EMPTY_GUARDIAN_DRAFT,
  LEAVE_STATUSES,
  MAX_GUARDIANS,
  NOTE_CATEGORIES,
  STUDENT_STATUSES,
  documentProblems,
  guardianProblems,
  noteProblems,
  type GuardianDraft,
} from "./rules";

type StudentStatusKey = (typeof STUDENT_STATUSES)[number];

export function Guardians({ student: s }: { student: StudentView }) {
  const t = useTranslations("students.guardians");
  const tState = useTranslations("academics.state");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const invite = async (guardianId: string) => {
    setMessage(null);
    try {
      await inviteGuardian(guardianId);
      toast({ tone: "success", title: t("invited") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  };
  const remove = async (guardianId: string) => {
    setMessage(null);
    try {
      await removeGuardian(s.id, guardianId);
      await qc.invalidateQueries({ queryKey: ["student", s.id] });
      toast({ tone: "success", title: tState("deleted") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  };
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{t("title")}</CardTitle>
      {s.guardians.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {s.guardians.map((g) => (
            <li
              key={g.id}
              className="flex flex-col gap-3 rounded-control border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{`${g.firstName} ${g.lastName}`}</p>
                  <p className="text-sm text-muted-foreground">{g.relationship}</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">#{g.priority}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {g.isPrimaryPayer ? <StatusBadge tone="info">{t("primary")}</StatusBadge> : null}
                {g.isEmergencyContact ? (
                  <StatusBadge tone="warning">{t("emergency")}</StatusBadge>
                ) : null}
                {g.canPickup ? <StatusBadge tone="success">{t("pickup")}</StatusBadge> : null}
              </div>
              {access.writable ? (
                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  <Button variant="ghost" onClick={() => void remove(g.id)}>
                    {t("remove")}
                  </Button>
                  <Button variant="secondary" onClick={() => void invite(g.id)}>
                    {t("invite")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {access.writable && s.guardians.length < MAX_GUARDIANS ? (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("addTitle")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
      {adding ? (
        <AddGuardianDialog
          studentId={s.id}
          nextPriority={s.guardians.length + 1}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            toast({ tone: "success", title: t("saved") });
            await qc.invalidateQueries({ queryKey: ["student", s.id] });
            setAdding(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function AddGuardianDialog({
  studentId,
  nextPriority,
  onClose,
  onSaved,
}: {
  studentId: string;
  nextPriority: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("students.guardians");
  const tField = useTranslations("students.field");
  const tRules = useTranslations("students.rules");
  const tState = useTranslations("academics.state");
  const [g, setG] = useState<GuardianDraft>({
    ...EMPTY_GUARDIAN_DRAFT,
    priority: String(nextPriority),
  });
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const found = guardianProblems(g);
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await addGuardian(studentId, {
        firstName: g.firstName.trim(),
        lastName: g.lastName.trim(),
        phone: g.phone.trim(),
        email: g.email.trim() === "" ? null : g.email.trim(),
        relationship: g.relationship.trim(),
        isPrimaryPayer: g.isPrimaryPayer,
        isEmergencyContact: g.isEmergencyContact,
        canPickup: g.canPickup,
        priority: Number(g.priority),
      });
      await onSaved();
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tState("cancel")}
          </Button>
          <Button onClick={save} loading={busy} loadingLabel={tState("loading")}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={tField("firstNameG")}
          required
          value={g.firstName}
          onChange={(e) => setG({ ...g, firstName: e.target.value })}
        />
        <Input
          label={tField("lastNameG")}
          required
          value={g.lastName}
          onChange={(e) => setG({ ...g, lastName: e.target.value })}
        />
        <Input
          label={tField("phone")}
          inputMode="tel"
          required
          value={g.phone}
          onChange={(e) => setG({ ...g, phone: e.target.value })}
        />
        <Input
          label={tField("email")}
          type="email"
          value={g.email}
          onChange={(e) => setG({ ...g, email: e.target.value })}
        />
        <Input
          label={tField("relationship")}
          required
          value={g.relationship}
          onChange={(e) => setG({ ...g, relationship: e.target.value })}
        />
        <Input
          label={tField("priority")}
          inputMode="numeric"
          value={g.priority}
          onChange={(e) => setG({ ...g, priority: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={g.isPrimaryPayer}
            onChange={(e) => setG({ ...g, isPrimaryPayer: e.target.checked })}
          />
          {tField("primaryPayer")}
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={g.isEmergencyContact}
            onChange={(e) => setG({ ...g, isEmergencyContact: e.target.checked })}
          />
          {tField("emergencyContact")}
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={g.canPickup}
            onChange={(e) => setG({ ...g, canPickup: e.target.checked })}
          />
          {tField("canPickup")}
        </label>
      </div>
      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-danger-foreground">
          {problems.map((p) => (
            <li key={p}>{tRules(p)}</li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Dialog>
  );
}

export function Documents({ studentId }: { studentId: string }) {
  const t = useTranslations("students.documents");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("students.rules");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const docs = useQuery({ ...studentDocumentsQuery(studentId), enabled: access.canRead });
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    const found = documentProblems(type, notes);
    if (file === null) found.push("fileType");
    setProblems(found);
    if (found.length > 0 || file === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const stored = await uploadFile(file, "document");
      await addDocument(studentId, {
        fileId: stored.id,
        type: type.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      setType("");
      setNotes("");
      setFile(null);
      await qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
      toast({ tone: "success", title: t("uploaded") });
    } catch (err) {
      if (err instanceof UploadRefused) setProblems([err.reason]);
      else setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardTitle>{t("title")}</CardTitle>
        {docs.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : docs.data && docs.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(docs.data ?? []).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{d.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.createdAt
                      ? t("uploadedOn", { when: formatCalendarDate(d.createdAt.slice(0, 10)) })
                      : ""}
                    {d.notes ? ` · ${d.notes}` : ""}
                  </p>
                </div>
                {access.writable ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await removeDocument(studentId, d.id);
                        await qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
                        toast({ tone: "success", title: t("removed") });
                      } catch (err) {
                        setMessage(refusalText(err, tState));
                      }
                    }}
                    aria-label={t("remove", { name: d.type })}
                  >
                    {t("remove", { name: d.type })}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>

      {access.writable ? (
        <Card className="flex flex-col gap-4">
          <CardTitle>{t("upload")}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("type")} value={type} onChange={(e) => setType(e.target.value)} />
            <Input label={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="document-file" className="text-sm font-semibold text-foreground">
              {t("file")}
            </label>
            <input
              id="document-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-11 w-full rounded-control border border-input-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:font-semibold file:text-brand-soft-foreground"
            />
          </div>
          {problems.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-1 text-sm text-danger-foreground">
              {problems.map((p) => (
                <li key={p}>{tRules(p)}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={upload} loading={busy} loadingLabel={t("uploading")}>
              {t("upload")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function Notes({ studentId }: { studentId: string }) {
  const t = useTranslations("students.notesSection");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("students.rules");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const notes = useQuery({ ...studentNotesQuery(studentId), enabled: access.canNotesRead });
  const [category, setCategory] = useState<string>("Pastoral");
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const found = noteProblems(text, category);
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await addNote(studentId, category as "Pastoral" | "Disciplinary", text.trim());
      setText("");
      await qc.invalidateQueries({ queryKey: ["student-notes", studentId] });
      toast({ tone: "success", title: t("saved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardTitle>{t("title")}</CardTitle>
        {notes.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : notes.data && notes.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(notes.data ?? []).map((n) => (
              <li
                key={n.id}
                className="rounded-control border border-border bg-background px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge tone={n.category === "Disciplinary" ? "warning" : "info"}>
                    {n.category}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {n.createdAt ? formatCalendarDate(n.createdAt.slice(0, 10)) : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-foreground">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>

      {access.canNotesWrite ? (
        <Card className="flex flex-col gap-4">
          <CardTitle>{t("add")}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <Select
              label={t("category")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {NOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === "Pastoral" ? t("category_Pastoral") : t("category_Disciplinary")}
                </option>
              ))}
            </Select>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note-text" className="text-sm font-semibold text-foreground">
                {t("text")}
              </label>
              <textarea
                id="note-text"
                rows={4}
                maxLength={1000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-control border border-input-border bg-surface px-3.5 py-2 text-base text-foreground shadow-card focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
              />
            </div>
          </div>
          {problems.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-1 text-sm text-danger-foreground">
              {problems.map((p) => (
                <li key={p}>{tRules(p)}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={add} loading={busy} loadingLabel={tState("loading")}>
              {t("add")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function Lifecycle({ student: s }: { student: StudentView }) {
  const t = useTranslations("students.lifecycle");
  const tProfile = useTranslations("students.profile");
  const tState = useTranslations("academics.state");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const arms = useArmOptions(access.canLifecycle);
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canLifecycle });
  const [action, setAction] = useState<"withdraw" | "transfer" | "graduate" | "reinstate" | null>(
    null,
  );
  const [effectiveOn, setEffectiveOn] = useState(new Date().toISOString().slice(0, 10));
  const [leave, setLeave] = useState<(typeof LEAVE_STATUSES)[number]>("Withdrawn");
  const [armId, setArmId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tStatus = useTranslations("students.statusLabels");
  const canAct = access.canLifecycle && s.status !== "Graduated";
  if (!access.canLifecycle)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      if (action === "withdraw") await leaveStudent(s.id, leave, effectiveOn);
      if (action === "graduate") await graduateStudent(s.id, effectiveOn);
      if (action === "transfer") await transferStudentArm(s.id, armId);
      if (action === "reinstate") await reinstateStudent(s.id, sessionId, armId);
      await qc.invalidateQueries({ queryKey: ["student", s.id] });
      await qc.invalidateQueries({ queryKey: ["students"] });
      toast({ tone: "success", title: t("done") });
      setAction(null);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  const actions: Array<[typeof action, string]> = [
    ["withdraw", t("withdraw")],
    ["transfer", t("transfer")],
    ["graduate", t("graduate")],
    ["reinstate", t("reinstate")],
  ];

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{tProfile("lifecycle")}</CardTitle>
      <p className="text-sm text-muted-foreground">{tStatus(s.status as StudentStatusKey)}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map(([key, label]) => (
          <Button
            key={key}
            variant={key === "withdraw" ? "danger" : "secondary"}
            disabled={!canAct && key !== "reinstate"}
            onClick={() => setAction(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {action !== null ? (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-background p-5">
          <p className="text-sm text-muted-foreground">
            {action === "withdraw"
              ? t("withdrawBody")
              : action === "transfer"
                ? t("transferBody")
                : action === "graduate"
                  ? t("graduateBody")
                  : t("reinstateBody")}
          </p>
          {action === "withdraw" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t("leaveStatus")}
                value={leave}
                onChange={(e) => setLeave(e.target.value as (typeof LEAVE_STATUSES)[number])}
              >
                <option value="Withdrawn">{t("leaveWithdrawn")}</option>
                <option value="Transferred">{t("leaveTransferred")}</option>
              </Select>
              <Input
                label={t("effectiveOn")}
                type="date"
                value={effectiveOn}
                onChange={(e) => setEffectiveOn(e.target.value)}
              />
            </div>
          ) : null}
          {action === "graduate" ? (
            <Input
              label={t("effectiveOn")}
              type="date"
              value={effectiveOn}
              onChange={(e) => setEffectiveOn(e.target.value)}
            />
          ) : null}
          {action === "transfer" || action === "reinstate" ? (
            <Select label={t("newArm")} value={armId} onChange={(e) => setArmId(e.target.value)}>
              <option value="">—</option>
              {arms.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          ) : null}
          {action === "reinstate" ? (
            <Select
              label={t("reinstateSession")}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">—</option>
              {(sessions.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          ) : null}
          {message ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              {tState("cancel")}
            </Button>
            <Button onClick={run} loading={busy} loadingLabel={tState("loading")}>
              {t("confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
