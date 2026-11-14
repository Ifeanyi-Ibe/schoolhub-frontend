// Validation for class levels and arms. The server's rules are authoritative; these only catch what the
// form can see before a request is made, and each message comes from the catalogue.

/**
 * The sections a class level accepts. The contract types `section` as a free string, but the backend
 * parses it as its ClassSection enum (SchoolHub.Modules.Academics/Domain/ClassStructure.cs), and any other
 * text is refused with academics.invalid. Until the contract documents the enum (BACKEND_GAPS B-22), the
 * screen offers exactly these values.
 */
export const CLASS_SECTIONS = [
  "Creche",
  "Nursery",
  "Primary",
  "JuniorSecondary",
  "SeniorSecondary",
] as const;
export type ClassSection = (typeof CLASS_SECTIONS)[number];

export interface LevelDraft {
  code: string;
  name: string;
  order: string;
  section: string;
}

export interface ArmDraft {
  name: string;
  capacity: string;
}

/** A whole number from a text field, or null when it is not one. Zero and above only for counts and order. */
export function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

export type LevelProblem = "codeRequired" | "nameRequired" | "sectionRequired" | "orderInvalid";

export type ArmProblem = "nameRequired" | "capacityInvalid";

/** The problem with one field of a level draft, or null. Each field reports only its own problem. */
export function levelFieldProblem(field: keyof LevelDraft, draft: LevelDraft): LevelProblem | null {
  switch (field) {
    case "code":
      return draft.code.trim() === "" ? "codeRequired" : null;
    case "name":
      return draft.name.trim() === "" ? "nameRequired" : null;
    case "section":
      return (CLASS_SECTIONS as readonly string[]).includes(draft.section)
        ? null
        : "sectionRequired";
    case "order":
      return wholeNumber(draft.order) === null ? "orderInvalid" : null;
  }
}

/** The problem with one field of an arm draft, or null. */
export function armFieldProblem(field: keyof ArmDraft, draft: ArmDraft): ArmProblem | null {
  switch (field) {
    case "name":
      return draft.name.trim() === "" ? "nameRequired" : null;
    case "capacity":
      return wholeNumber(draft.capacity) === null ? "capacityInvalid" : null;
  }
}
