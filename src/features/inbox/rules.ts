// Inbox and preference rules (ADR 0025). The server decides what each preference may be; the screen sends only what changed,
// and never a locked preference.

export interface PreferenceLike {
  category: string;
  channel: string;
  enabled: boolean;
  locked: boolean;
}

export const preferenceKey = (p: { category: string; channel: string }) =>
  `${p.category}|${p.channel}`;

/** The preferences the user changed on the screen, leaving out locked ones and anything the server already holds. */
export function changedPreferences(
  items: readonly PreferenceLike[],
  edited: ReadonlyMap<string, boolean>,
): Array<{ category: string; channel: string; enabled: boolean }> {
  const out: Array<{ category: string; channel: string; enabled: boolean }> = [];
  for (const item of items) {
    if (item.locked) continue;
    const next = edited.get(preferenceKey(item));
    if (next === undefined || next === item.enabled) continue;
    out.push({ category: item.category, channel: item.channel, enabled: next });
  }
  return out;
}

/** The page number after a move, kept within the pages that exist (a page is at least 1). */
export function clampPage(page: number, totalCount: number | string, pageSize: number): number {
  const total = Number(totalCount);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), last);
}
