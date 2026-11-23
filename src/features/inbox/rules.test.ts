import { describe, expect, it } from "vitest";
import { changedPreferences, clampPage, preferenceKey, type PreferenceLike } from "./rules";

const items: PreferenceLike[] = [
  { category: "fees", channel: "email", enabled: true, locked: false },
  { category: "fees", channel: "sms", enabled: false, locked: false },
  { category: "security", channel: "email", enabled: true, locked: true },
];

describe("only changed, unlocked preferences are sent", () => {
  it("sends nothing when nothing changed", () => {
    expect(changedPreferences(items, new Map())).toEqual([]);
    expect(changedPreferences(items, new Map([[preferenceKey(items[0]!), true]]))).toEqual([]);
  });

  it("sends a changed preference", () => {
    const edited = new Map([[preferenceKey(items[1]!), true]]);
    expect(changedPreferences(items, edited)).toEqual([
      { category: "fees", channel: "sms", enabled: true },
    ]);
  });

  it("never sends a locked preference, even if the screen holds a change to it", () => {
    const edited = new Map([[preferenceKey(items[2]!), false]]);
    expect(changedPreferences(items, edited)).toEqual([]);
  });
});

describe("the page stays within the pages that exist", () => {
  it("keeps a page between 1 and the last page", () => {
    expect(clampPage(0, 45, 20)).toBe(1);
    expect(clampPage(9, 45, 20)).toBe(3);
    expect(clampPage(2, 0, 20)).toBe(1);
    expect(clampPage(2, "45", 20)).toBe(2);
  });
});
