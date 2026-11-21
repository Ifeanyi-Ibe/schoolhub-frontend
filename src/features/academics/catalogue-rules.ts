// Validation for subjects, grading bands, assessment components and calendar days. The server's rules are
// authoritative; these functions catch what the screen can see before a request is made. They return
// message codes, and each code is translated from the catalogue (academics.rules.*) by the component.

import type { components } from "@/lib/api/schema";

/**
 * Subject categories and calendar day types, from the contract (SubjectRequest.category and
 * CalendarDayRequest.type, enums since B-25). The backend refuses any other value.
 */
export type SubjectCategory = components["schemas"]["SubjectRequest"]["category"];
export type CalendarDayType = components["schemas"]["CalendarDayRequest"]["type"];
export const SUBJECT_CATEGORIES: readonly SubjectCategory[] = ["Core", "Elective", "Extra"];
export const CALENDAR_DAY_TYPES: readonly CalendarDayType[] = [
  "Holiday",
  "NonSchoolDay",
  "SpecialEvent",
];
export function isSubjectCategory(value: string): value is SubjectCategory {
  return (SUBJECT_CATEGORIES as readonly string[]).includes(value);
}
export function isCalendarDayType(value: string): value is CalendarDayType {
  return (CALENDAR_DAY_TYPES as readonly string[]).includes(value);
}

export const SCORE_MAX = 100;
export const ASSESSMENT_TOTAL = 100;

// Subjects ---------------------------------------------------------------------------------------

export interface SubjectDraft {
  code: string;
  name: string;
  category: string;
}

export function subjectProblems(draft: SubjectDraft): string[] {
  const problems: string[] = [];
  if (draft.code.trim() === "") problems.push("subject.code");
  if (draft.name.trim() === "") problems.push("subject.name");
  if (!(SUBJECT_CATEGORIES as readonly string[]).includes(draft.category))
    problems.push("subject.category");
  return problems;
}

// Grading bands ----------------------------------------------------------------------------------

export interface BandDraft {
  min: string;
  max: string;
  grade: string;
  remark: string;
}

export interface BandCheck {
  /** Problem codes per row, in the order the rows were given. */
  rows: string[][];
  /** Problems about the set as a whole (coverage, overlap, gaps). */
  overall: string[];
  valid: boolean;
}

/** A whole number from the text, or null when it is not one. */
export function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Bands are integer score ranges. Together they must cover 0 to 100 with no overlap and no gap: sorted by
 * their minimum, the first starts at 0, each next starts the score after the previous one ends, and the last
 * ends at 100. Each band needs a grade and a remark.
 */
export function checkBands(drafts: readonly BandDraft[]): BandCheck {
  const rows: string[][] = drafts.map((d) => {
    const problems: string[] = [];
    const min = wholeNumber(d.min);
    const max = wholeNumber(d.max);
    if (min === null || max === null) problems.push("band.number");
    else if (min < 0 || max > SCORE_MAX || min > max) problems.push("band.range");
    if (d.grade.trim() === "") problems.push("band.grade");
    if (d.remark.trim() === "") problems.push("band.remark");
    return problems;
  });

  const overall: string[] = [];
  const numbered = drafts
    .map((d) => ({ min: wholeNumber(d.min), max: wholeNumber(d.max) }))
    .filter(
      (b): b is { min: number; max: number } => b.min !== null && b.max !== null && b.min <= b.max,
    )
    .sort((a, b) => a.min - b.min);

  if (drafts.length === 0) {
    overall.push("bands.none");
  } else if (rows.some((r) => r.includes("band.number") || r.includes("band.range"))) {
    // A bad row is reported on its own line; coverage is judged once every range reads.
  } else {
    if (numbered[0]!.min !== 0) overall.push("bands.start");
    if (numbered[numbered.length - 1]!.max !== SCORE_MAX) overall.push("bands.end");
    for (let i = 1; i < numbered.length; i++) {
      const prev = numbered[i - 1]!;
      const next = numbered[i]!;
      if (next.min <= prev.max) overall.push("bands.overlap");
      else if (next.min > prev.max + 1) overall.push("bands.gap");
    }
  }

  const valid = overall.length === 0 && rows.every((r) => r.length === 0);
  return { rows, overall: [...new Set(overall)], valid };
}

// Assessment components --------------------------------------------------------------------------

export interface ComponentDraft {
  name: string;
  maxScore: string;
  /** Optional. The screen defaults it to the maximum score; the backend accepts 0 to 100. */
  weight?: string;
}

/** The backend's limit on a component name (ComponentRequestValidator, SchoolHub.Modules.Academics). */
export const COMPONENT_NAME_MAX = 30;

export interface ComponentCheck {
  rows: string[][];
  /** The running total after each row, in the order given. Missing or invalid rows add nothing. */
  running: number[];
  total: number;
  overall: string[];
  valid: boolean;
}

/** Maximum scores must be whole positive numbers and must add up to 100. */
export function checkComponents(drafts: readonly ComponentDraft[]): ComponentCheck {
  const rows: string[][] = drafts.map((d) => {
    const problems: string[] = [];
    if (d.name.trim() === "") problems.push("component.name");
    else if (d.name.trim().length > COMPONENT_NAME_MAX) problems.push("component.nameLength");
    const max = wholeNumber(d.maxScore);
    if (max === null || max <= 0 || max > SCORE_MAX) problems.push("component.max");
    if (d.weight !== undefined && d.weight.trim() !== "") {
      const weight = wholeNumber(d.weight);
      if (weight === null || weight < 0 || weight > 100) problems.push("component.weight");
    }
    return problems;
  });
  let total = 0;
  const running = drafts.map((d) => {
    const max = wholeNumber(d.maxScore);
    if (max !== null && max > 0 && max <= SCORE_MAX) total += max;
    return total;
  });
  const overall: string[] = [];
  if (drafts.length === 0) overall.push("components.none");
  else if (total !== ASSESSMENT_TOTAL) overall.push("components.total");
  const valid = overall.length === 0 && rows.every((r) => r.length === 0);
  return { rows, running, total, overall, valid };
}

// Calendar days ----------------------------------------------------------------------------------

export interface CalendarDraft {
  date: string;
  type: string;
  name: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(text: string): boolean {
  const m = ISO_DATE.exec(text.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function calendarProblems(draft: CalendarDraft): string[] {
  const problems: string[] = [];
  if (!isIsoDate(draft.date)) problems.push("calendar.date");
  if (!(CALENDAR_DAY_TYPES as readonly string[]).includes(draft.type))
    problems.push("calendar.type");
  if (draft.name.trim() === "") problems.push("calendar.name");
  return problems;
}

// Academic sessions and terms -------------------------------------------------------------------------

export interface SessionDraft {
  name: string;
  startsOn: string;
  endsOn: string;
}

/** The backend's limit on a session name (the rollover request validates it at 20 characters). */
export const SESSION_NAME_MAX = 20;

/** A session needs a name, and real dates with the end on or after the start. */
export function sessionProblems(draft: SessionDraft): string[] {
  const problems: string[] = [];
  if (draft.name.trim() === "") problems.push("session.name");
  else if (draft.name.trim().length > SESSION_NAME_MAX) problems.push("session.nameLength");
  if (!isIsoDate(draft.startsOn)) problems.push("session.start");
  if (!isIsoDate(draft.endsOn)) problems.push("session.end");
  else if (isIsoDate(draft.startsOn) && draft.endsOn < draft.startsOn)
    problems.push("session.order");
  return problems;
}

export interface TermDraft {
  number: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

/** A term needs a positive whole number, a name, and real dates with the end on or after the start. */
export function termProblems(draft: TermDraft): string[] {
  const problems: string[] = [];
  const n = wholeNumber(draft.number);
  if (n === null || n < 1 || n > 99) problems.push("term.number");
  if (draft.name.trim() === "") problems.push("term.name");
  if (!isIsoDate(draft.startsOn)) problems.push("term.start");
  if (!isIsoDate(draft.endsOn)) problems.push("term.end");
  else if (isIsoDate(draft.startsOn) && draft.endsOn < draft.startsOn) problems.push("term.order");
  return problems;
}
