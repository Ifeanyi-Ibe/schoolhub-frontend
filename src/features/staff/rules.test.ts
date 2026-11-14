import { describe, expect, it } from "vitest";
import {
  canGrantRole,
  canToggleRolePermission,
  hasContact,
  hasCustomRoles,
  holdsAny,
  parsePeopleQuery,
  peopleQueryParams,
} from "./rules";

describe("escalation: a role can be granted only when the user holds all its permissions", () => {
  const mine = ["students.read", "users.invite"];

  it("allows a role whose permissions are a subset of the user's own", () => {
    expect(canGrantRole({ permissions: ["students.read"] }, mine)).toBe(true);
    expect(canGrantRole({ permissions: [] }, mine)).toBe(true);
  });

  it("refuses a role that carries even one permission the user does not hold", () => {
    expect(canGrantRole({ permissions: ["students.read", "roles.manage"] }, mine)).toBe(false);
  });

  it("toggles a role permission only when the user holds it", () => {
    expect(canToggleRolePermission("users.invite", mine)).toBe(true);
    expect(canToggleRolePermission("roles.manage", mine)).toBe(false);
  });
});

describe("plan and visibility", () => {
  it("reads the custom-role feature from the school's entitlements", () => {
    expect(hasCustomRoles(["customRoles"])).toBe(true);
    expect(hasCustomRoles(["admissions"])).toBe(false);
    expect(hasCustomRoles([])).toBe(false);
  });

  it("shows a screen when the user holds any one of its permissions", () => {
    expect(holdsAny(["users.manage"], ["users.invite", "users.manage"])).toBe(true);
    expect(holdsAny(["me.profile"], ["users.invite", "users.manage"])).toBe(false);
  });
});

describe("invitations need a way to reach the person", () => {
  it("accepts an email or a phone, and refuses neither", () => {
    expect(hasContact("ada@example.com", "")).toBe(true);
    expect(hasContact("", "+2348000000001")).toBe(true);
    expect(hasContact("  ", "")).toBe(false);
  });
});

describe("the people list's state lives in the URL", () => {
  it("reads a search and a page, with safe defaults for anything else", () => {
    expect(parsePeopleQuery(new URLSearchParams("q=%20ada%20&page=3"))).toEqual({
      q: "ada",
      page: 3,
    });
    expect(parsePeopleQuery(new URLSearchParams("page=0"))).toEqual({ q: "", page: 1 });
    expect(parsePeopleQuery(new URLSearchParams("page=abc"))).toEqual({ q: "", page: 1 });
    expect(parsePeopleQuery(new URLSearchParams("q=" + "x".repeat(200))).q).toHaveLength(100);
  });

  it("writes only the values that differ from the defaults, so the first page has a clean URL", () => {
    expect(peopleQueryParams({ q: "", page: 1 }).toString()).toBe("");
    expect(peopleQueryParams({ q: "ada", page: 2 }).toString()).toBe("q=ada&page=2");
  });
});
