// Announcement rules (ADR 0025). The screen decides what can be edited, sent or cancelled from the timestamps the server returns,
// because the contract leaves the status as a free string (B-49). The server still decides.

export const AUDIENCES = ["all", "levels", "arms", "staff", "custom"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const CHANNELS = ["sms", "email", "inapp"] as const;

/** The audiences that name specific people or groups, and so need ids. */
export function needsIds(audience: string): boolean {
  return audience === "levels" || audience === "arms" || audience === "custom";
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  audience: string;
  ids: string[];
  channels: string[];
}

export function draftProblems(d: AnnouncementDraft): string[] {
  const out: string[] = [];
  if (d.title.trim() === "") out.push("titleRequired");
  if (d.body.trim() === "") out.push("bodyRequired");
  if (d.channels.length === 0) out.push("channelRequired");
  if (needsIds(d.audience) && d.ids.length === 0) out.push("idsRequired");
  return out;
}

/** An announcement can be changed, sent or cancelled only before it has been sent or cancelled. */
export function isOpen(a: { sentAt: string | null; cancelledAt: string | null }): boolean {
  return a.sentAt === null && a.cancelledAt === null;
}

/** Sending needs a preview that the school's SMS units cover, when the announcement uses SMS. */
export function sendBlockedBy(
  preview: { sufficient: boolean },
  channels: readonly string[],
): "insufficientSms" | null {
  if (channels.includes("sms") && !preview.sufficient) return "insufficientSms";
  return null;
}
