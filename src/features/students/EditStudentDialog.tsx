"use client";

// The profile's sections. Each loads when its tab is opened (see StudentProfileView), so the profile page's first
// load does not include the forms, dialogs and tables of the sections the user has not opened.

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { Dialog } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { refusalText } from "./refusal";

import { updateStudent, type StudentView } from "./api";

export function EditDetails({
  student: s,
  onClose,
  onSaved,
}: {
  student: StudentView;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("students.profile");
  const tField = useTranslations("students.field");
  const tRules = useTranslations("students.rules");
  const tState = useTranslations("academics.state");
  const [first, setFirst] = useState(s.firstName);
  const [middle, setMiddle] = useState(s.middleName ?? "");
  const [last, setLast] = useState(s.lastName);
  const [gender, setGender] = useState<string>(s.gender);
  const [dob, setDob] = useState(s.dateOfBirth);
  const [address, setAddress] = useState(s.address ?? "");
  const [medical, setMedical] = useState(s.medicalNotes ?? "");
  const [special, setSpecial] = useState(s.specialNeedsNotes ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const found: string[] = [];
    if (first.trim() === "") found.push("firstNameRequired");
    if (last.trim() === "") found.push("lastNameRequired");
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateStudent(s.id, {
        firstName: first.trim(),
        middleName: middle.trim() === "" ? null : middle.trim(),
        lastName: last.trim(),
        gender: gender === "" ? null : (gender as "Female" | "Male"),
        dateOfBirth: dob,
        address: address.trim() === "" ? null : address.trim(),
        medicalNotes: medical.trim() === "" ? null : medical.trim(),
        specialNeedsNotes: special.trim() === "" ? null : special.trim(),
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
      title={t("editTitle")}
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
          label={tField("firstName")}
          required
          value={first}
          onChange={(e) => setFirst(e.target.value)}
        />
        <Input
          label={tField("middleName")}
          value={middle}
          onChange={(e) => setMiddle(e.target.value)}
        />
        <Input
          label={tField("lastName")}
          required
          value={last}
          onChange={(e) => setLast(e.target.value)}
        />
        <Select label={tField("gender")} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
        </Select>
        <Input
          label={tField("dateOfBirth")}
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
        <Input
          label={tField("address")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input
          label={tField("medicalNotes")}
          value={medical}
          onChange={(e) => setMedical(e.target.value)}
        />
        <Input
          label={tField("specialNeedsNotes")}
          value={special}
          onChange={(e) => setSpecial(e.target.value)}
        />
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
