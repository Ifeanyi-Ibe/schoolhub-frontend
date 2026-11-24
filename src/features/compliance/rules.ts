// Compliance rules (ADR 0025, slice 5). The server decides who may decide a data request (maker-checker); these checks stop an
// incomplete request before it is sent, and say which buttons to show from the fields the server returns.

export const PURPOSES = ["Messaging", "Photography", "ThirdPartyProcessing"] as const;
export const CHANNELS = ["Any", "Sms", "Email", "WhatsApp", "InApp"] as const;
export const REQUEST_KINDS = ["Export", "Erase"] as const;
export const REASON_MAX = 300;

export function subjectProblem(
  subjectType: string,
  subjectId: string,
): "typeRequired" | "idRequired" | null {
  if (subjectType.trim() === "") return "typeRequired";
  if (subjectId.trim() === "") return "idRequired";
  return null;
}

export function reasonProblem(reason: string): "required" | "tooLong" | null {
  const s = reason.trim();
  if (s === "") return "required";
  return s.length > REASON_MAX ? "tooLong" : null;
}

/** A data request is open until a decision is recorded; the server sets `decidedAt` when it is. */
export function isOpenRequest(r: { decidedAt: string | null }): boolean {
  return r.decidedAt === null;
}
