import { describe, expect, it } from "vitest";
import { draftProblems, isOpen, needsIds, sendBlockedBy, type AnnouncementDraft } from "./rules";

const ok: AnnouncementDraft = {
  title: "Sports day",
  body: "Friday at 8",
  audience: "all",
  ids: [],
  channels: ["inapp"],
};

describe("an announcement draft", () => {
  it("is complete for a whole-school message", () => {
    expect(draftProblems(ok)).toEqual([]);
  });

  it("needs a title, a body and a channel", () => {
    expect(draftProblems({ ...ok, title: " " })).toEqual(["titleRequired"]);
    expect(draftProblems({ ...ok, body: "" })).toEqual(["bodyRequired"]);
    expect(draftProblems({ ...ok, channels: [] })).toEqual(["channelRequired"]);
  });

  it("needs ids for the audiences that name groups or people", () => {
    expect(needsIds("levels")).toBe(true);
    expect(needsIds("all")).toBe(false);
    expect(draftProblems({ ...ok, audience: "custom" })).toEqual(["idsRequired"]);
    expect(draftProblems({ ...ok, audience: "arms", ids: ["a"] })).toEqual([]);
  });
});

describe("what can still be done to an announcement", () => {
  it("is open only before it is sent or cancelled", () => {
    expect(isOpen({ sentAt: null, cancelledAt: null })).toBe(true);
    expect(isOpen({ sentAt: "2026-11-23T08:00:00Z", cancelledAt: null })).toBe(false);
    expect(isOpen({ sentAt: null, cancelledAt: "2026-11-23T08:00:00Z" })).toBe(false);
  });
});

describe("sending by SMS needs the units", () => {
  it("is blocked when SMS is chosen and the units do not cover it", () => {
    expect(sendBlockedBy({ sufficient: false }, ["sms", "inapp"])).toBe("insufficientSms");
    expect(sendBlockedBy({ sufficient: false }, ["inapp"])).toBeNull();
    expect(sendBlockedBy({ sufficient: true }, ["sms"])).toBeNull();
  });
});
