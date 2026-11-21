// Students: permissions, limits and validation. The server's rules are authoritative; these catch what the
// screen can see before a request is made. Limits mirror the backend (SchoolHub.Modules.Students, Domain/*).
// Every message is a catalogue key (students.rules.*), translated by the component.

export const STUDENT_PERMISSION = {
  read: "students.read",
  write: "students.write",
  sensitiveRead: "students.sensitive.read",
  delete: "students.delete",
  notesRead: "students.notes.read",
  notesWrite: "students.notes.write",
  duplicatesOverride: "students.duplicates.override",
  lifecycle: "students.lifecycle.manage",
  importRun: "students.import.run",
  promotions: "promotions.manage",
} as const;

export const NAME_MAX = 60;
export const ADDRESS_MAX = 200;
export const SENSITIVE_MAX = 2000;
export const RELATIONSHIP_MAX = 30;
export const NOTE_MAX = 1000;
export const DOCUMENT_TYPE_MAX = 40;
export const DOCUMENT_NOTES_MAX = 200;
export const ADMISSION_NO_MAX = 40;
export const EMAIL_MAX = 254;
export const MAX_GUARDIANS = 5;

/** Gender values the contract declares (RegisterStudentRequest.gender). */
export const GENDERS = ["Female", "Male"] as const;
export type Gender = (typeof GENDERS)[number];

/** Statuses the list filters by (StudentListItem.status). */
export const STUDENT_STATUSES = [
  "Applicant",
  "Active",
  "Suspended",
  "Withdrawn",
  "Transferred",
  "Graduated",
] as const;

/** Note categories (NoteRequest.category). */
export const NOTE_CATEGORIES = ["Pastoral", "Disciplinary"] as const;

/** Leave outcomes (LeaveRequest.status). */
export const LEAVE_STATUSES = ["Withdrawn", "Transferred"] as const;

/** Import modes (CommitImportRequest.mode). */
export const IMPORT_MODES = ["SkipErrors", "AllOrNothing"] as const;

export const UPLOAD_LIMITS = {
  // Documents: PDF and common images (FileView contentTypes the school may store as documents).
  document: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024 },
  // Import: CSV (the template) or XLSX, the two forms the backend's importer reads (Import.cs).
  import: {
    types: ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    maxBytes: 5 * 1024 * 1024,
  },
  // School logo: JPEG or PNG up to 3 MiB (the backend's SchoolLogo rule, FilePurposeRules).
  logo: { types: ["image/jpeg", "image/png"], maxBytes: 3 * 1024 * 1024 },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_LIMITS;

export function isIsoDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A date of birth is real, not in the future, and not before 1900. */
export function dateOfBirthProblem(text: string, today: string): string | null {
  if (!isIsoDate(text)) return "dateOfBirth";
  if (text.trim() > today) return "dateOfBirthFuture";
  if (text.trim() < "1900-01-01") return "dateOfBirthPast";
  return null;
}

/** A Nigerian or international phone number: digits (with an optional leading +), 10 to 15 of them. */
export function phoneProblem(text: string): string | null {
  const compact = text.trim().replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return "phone";
  const digits = compact.replace(/^\+/, "");
  if (digits.length < 10 || digits.length > 15) return "phone";
  return null;
}

export function emailProblem(text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  if (t.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "email";
  return null;
}

export function maxProblem(text: string, max: number, key: string): string | null {
  return text.trim().length > max ? key : null;
}

export interface GuardianDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  relationship: string;
  priority: string;
  isPrimaryPayer: boolean;
  isEmergencyContact: boolean;
  canPickup: boolean;
}

export function guardianProblems(g: GuardianDraft): string[] {
  const out: string[] = [];
  if (g.firstName.trim() === "") out.push("guardian.firstNameRequired");
  else if (g.firstName.trim().length > NAME_MAX) out.push("guardian.nameLength");
  if (g.lastName.trim() === "") out.push("guardian.lastNameRequired");
  else if (g.lastName.trim().length > NAME_MAX) out.push("guardian.nameLength");
  const phone = phoneProblem(g.phone);
  if (phone) out.push(g.phone.trim() === "" ? "guardian.phoneRequired" : "guardian.phone");
  const email = emailProblem(g.email);
  if (email) out.push("guardian.email");
  if (g.relationship.trim() === "") out.push("guardian.relationshipRequired");
  else if (g.relationship.trim().length > RELATIONSHIP_MAX) out.push("guardian.relationshipLength");
  const p = Number(g.priority);
  if (!Number.isInteger(p) || p < 1 || p > 9) out.push("guardian.priority");
  return out;
}

export interface RegistrationDraft {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  admissionNo: string;
  admittedOn: string;
  sessionId: string;
  classArmId: string;
  medicalNotes: string;
  specialNeedsNotes: string;
}

/** The personal and admission steps of the registration wizard. Guardians are checked on their own step. */
export function registrationProblems(d: RegistrationDraft, today: string): string[] {
  const out: string[] = [];
  if (d.firstName.trim() === "") out.push("firstNameRequired");
  else if (d.firstName.trim().length > NAME_MAX) out.push("nameLength");
  if (d.middleName.trim().length > NAME_MAX) out.push("nameLength");
  if (d.lastName.trim() === "") out.push("lastNameRequired");
  else if (d.lastName.trim().length > NAME_MAX) out.push("nameLength");
  if (!(GENDERS as readonly string[]).includes(d.gender)) out.push("gender");
  const dob = dateOfBirthProblem(d.dateOfBirth, today);
  if (dob) out.push(dob);
  if (d.address.trim().length > ADDRESS_MAX) out.push("addressLength");
  if (d.admissionNo.trim().length > ADMISSION_NO_MAX) out.push("admissionNoLength");
  if (!isIsoDate(d.admittedOn)) out.push("admittedOn");
  if (d.sessionId === "") out.push("sessionRequired");
  if (d.classArmId === "") out.push("classArmRequired");
  if (d.medicalNotes.trim().length > SENSITIVE_MAX) out.push("sensitiveLength");
  if (d.specialNeedsNotes.trim().length > SENSITIVE_MAX) out.push("sensitiveLength");
  return out;
}

export function noteProblems(text: string, category: string): string[] {
  const out: string[] = [];
  if (!(NOTE_CATEGORIES as readonly string[]).includes(category)) out.push("noteCategory");
  if (text.trim() === "") out.push("noteRequired");
  else if (text.trim().length > NOTE_MAX) out.push("noteLength");
  return out;
}

export function documentProblems(type: string, notes: string): string[] {
  const out: string[] = [];
  if (type.trim() === "") out.push("documentTypeRequired");
  else if (type.trim().length > DOCUMENT_TYPE_MAX) out.push("documentTypeLength");
  if (notes.trim().length > DOCUMENT_NOTES_MAX) out.push("documentNotesLength");
  return out;
}

/** The file a user picks for an upload: type and size checked before anything is sent. */
export function uploadProblem(
  file: { type: string; size: number },
  purpose: UploadPurpose,
): string | null {
  const rule = UPLOAD_LIMITS[purpose];
  if (!(rule.types as readonly string[]).includes(file.type)) return "fileType";
  if (file.size <= 0) return "fileEmpty";
  if (file.size > rule.maxBytes) return "fileTooLarge";
  return null;
}

/** Import job states (ImportJobView.status). Polling continues while a job is still working. */
export const IMPORT_WORKING = ["Queued", "Validating", "CommitQueued", "Committing"] as const;
export const IMPORT_FINISHED = ["Validated", "Completed", "Failed"] as const;

export function isImportWorking(status: string): boolean {
  return (IMPORT_WORKING as readonly string[]).includes(status);
}

/** An empty guardian row for the forms (priority 1 until the form sets it). */
export const EMPTY_GUARDIAN_DRAFT: GuardianDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  relationship: "",
  priority: "1",
  isPrimaryPayer: false,
  isEmergencyContact: false,
  canPickup: false,
};
