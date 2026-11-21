// Staff records: constants and checks taken from the contract (docs/openapi/v1.json). The API decides what is
// allowed; these checks only stop a request the contract would refuse. Messages are keys (see messages/en.json).
import type { components } from "@/lib/api/schema";
import {
  ADDRESS_MAX,
  GENDERS,
  NAME_MAX,
  dateOfBirthProblem,
  emailProblem,
  isIsoDate,
  phoneProblem,
} from "@/features/students/rules";

export const STAFF_PERMISSION = {
  read: "staff.read",
  write: "staff.write",
  assign: "staff.assign",
  usersManage: "users.manage",
  invite: "users.invite",
} as const;

export const STAFF_TYPES = ["Teaching", "NonTeaching", "Admin", "Management"] as const;
export const EMPLOYMENT_TYPES = ["FullTime", "PartTime", "Contract", "Volunteer"] as const;
export const STAFF_STATUSES = ["Active", "OnLeave", "Resigned", "Terminated"] as const;
export type StaffType = (typeof STAFF_TYPES)[number];

export type StaffRequest = components["schemas"]["StaffRequest"];
export type AssignmentInput = components["schemas"]["AssignmentInput"];

/** The form's text state. Optional fields are empty strings here and null on the wire. */
export interface StaffDraft {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  staffType: string;
  jobTitle: string;
  department: string;
  employmentType: string;
  hireDate: string;
}

export const EMPTY_STAFF_DRAFT: StaffDraft = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  staffType: "Teaching",
  jobTitle: "",
  department: "",
  employmentType: "FullTime",
  hireDate: "",
};

const JOB_TITLE_MAX = 80;
const DEPARTMENT_MAX = 80;

export type StaffField = keyof StaffDraft;

/** The first problem key for each field that is wrong. Empty means the form may be sent. */
export function staffFieldProblems(
  d: StaffDraft,
  today: string,
): Partial<Record<StaffField, string>> {
  const out: Partial<Record<StaffField, string>> = {};
  if (d.firstName.trim() === "") out.firstName = "firstNameRequired";
  else if (d.firstName.trim().length > NAME_MAX) out.firstName = "nameLength";
  if (d.middleName.trim().length > NAME_MAX) out.middleName = "nameLength";
  if (d.lastName.trim() === "") out.lastName = "lastNameRequired";
  else if (d.lastName.trim().length > NAME_MAX) out.lastName = "nameLength";
  if (!(GENDERS as readonly string[]).includes(d.gender)) out.gender = "gender";
  const dob = dateOfBirthProblem(d.dateOfBirth, today);
  if (dob) out.dateOfBirth = dob;
  if (d.phone.trim() === "") out.phone = "phoneRequired";
  else if (phoneProblem(d.phone)) out.phone = "phone";
  if (emailProblem(d.email)) out.email = "email";
  if (d.address.trim().length > ADDRESS_MAX) out.address = "addressLength";
  if (!(STAFF_TYPES as readonly string[]).includes(d.staffType)) out.staffType = "staffType";
  if (d.jobTitle.trim() === "") out.jobTitle = "jobTitleRequired";
  else if (d.jobTitle.trim().length > JOB_TITLE_MAX) out.jobTitle = "jobTitleLength";
  if (d.department.trim().length > DEPARTMENT_MAX) out.department = "departmentLength";
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(d.employmentType))
    out.employmentType = "employmentType";
  if (!isIsoDate(d.hireDate)) out.hireDate = "hireDate";
  return out;
}

/** The problem keys for a staff draft. Empty means the form may be sent. */
export function staffProblems(d: StaffDraft, today: string): string[] {
  return Object.values(staffFieldProblems(d, today));
}

/** Today in Africa/Lagos as YYYY-MM-DD: the school's calendar, not the device's. */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function nullIfEmpty(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

/** The body for POST and PUT /staff. Every field is sent; optional ones as null. */
export function staffRequest(d: StaffDraft): StaffRequest {
  return {
    firstName: d.firstName.trim(),
    middleName: nullIfEmpty(d.middleName),
    lastName: d.lastName.trim(),
    gender: d.gender as StaffRequest["gender"],
    dateOfBirth: d.dateOfBirth.trim(),
    phone: d.phone.trim(),
    email: nullIfEmpty(d.email),
    address: nullIfEmpty(d.address),
    staffType: d.staffType as StaffRequest["staffType"],
    jobTitle: d.jobTitle.trim(),
    department: nullIfEmpty(d.department),
    employmentType: d.employmentType as StaffRequest["employmentType"],
    hireDate: d.hireDate.trim(),
  };
}

/** The form state for an existing record (nulls become empty text). */
export function draftFromStaff(s: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  staffType: string;
  jobTitle: string;
  department?: string | null;
  employmentType: string;
  hireDate: string;
}): StaffDraft {
  return {
    firstName: s.firstName,
    middleName: s.middleName ?? "",
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    phone: s.phone,
    email: s.email ?? "",
    address: s.address ?? "",
    staffType: s.staffType,
    jobTitle: s.jobTitle,
    department: s.department ?? "",
    employmentType: s.employmentType,
    hireDate: s.hireDate,
  };
}

export interface LeaveDraft {
  leaveType: string;
  startsOn: string;
  endsOn: string;
}

export const LEAVE_TYPE_MAX = 40;

/** A leave request: a type, and a date range that is real and does not end before it starts. */
export function leaveProblems(d: LeaveDraft): string[] {
  const out: string[] = [];
  if (d.leaveType.trim() === "") out.push("leaveTypeRequired");
  else if (d.leaveType.trim().length > LEAVE_TYPE_MAX) out.push("leaveTypeLength");
  if (!isIsoDate(d.startsOn)) out.push("startsOn");
  if (!isIsoDate(d.endsOn)) out.push("endsOn");
  else if (isIsoDate(d.startsOn) && d.endsOn < d.startsOn) out.push("endsBeforeStart");
  return out;
}

/** A leave request is pending until the API records a decision time. The status text is not used for this. */
export function isPendingLeave(decidedAt: string | null | undefined): boolean {
  return decidedAt === null || decidedAt === undefined || decidedAt === "";
}

export interface AssignmentDraft {
  classArmId: string;
  subjectId: string;
  isFormTeacher: boolean;
}

/**
 * The rows for one session, checked before they are sent. A class arm has one form teacher. The API also checks
 * this across the whole session and answers 409 if another teacher holds it.
 */
export function assignmentProblems(rows: AssignmentDraft[]): string[] {
  const out: string[] = [];
  const formTeachers = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.classArmId === "") out.push("armRequired");
    const key = `${r.classArmId}|${r.subjectId}`;
    if (seen.has(key)) out.push("assignmentDuplicate");
    seen.add(key);
    if (r.isFormTeacher) {
      if (formTeachers.has(r.classArmId)) out.push("formTeacherTwice");
      formTeachers.add(r.classArmId);
    }
  }
  return [...new Set(out)];
}

export function assignmentRequest(rows: AssignmentDraft[]): AssignmentInput[] {
  return rows.map((r) => ({
    classArmId: r.classArmId,
    subjectId: r.subjectId === "" ? null : r.subjectId,
    isFormTeacher: r.isFormTeacher,
  }));
}

export interface InviteDraft {
  email: string;
  phone: string;
  roleNames: string[];
}

/** An invitation needs an email or a phone number, and at least one role. */
export function inviteProblems(d: InviteDraft): string[] {
  const out: string[] = [];
  const email = d.email.trim();
  const phone = d.phone.trim();
  if (email === "" && phone === "") out.push("contactRequired");
  if (email !== "" && emailProblem(email)) out.push("email");
  if (phone !== "" && phoneProblem(phone)) out.push("phone");
  if (d.roleNames.length === 0) out.push("roleRequired");
  return out;
}
