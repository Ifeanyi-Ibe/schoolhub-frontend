import { describe, expect, it } from "vitest";
import { removalCostsOwnStaffAccess, type RoleRef } from "./user-roles";

const roles: RoleRef[] = [
  {
    id: "admin",
    permissions: ["students.read", "users.invite", "users.manage", "roles.assign", "roles.manage"],
  },
  { id: "registrar", permissions: ["students.read"] },
  { id: "inviter", permissions: ["users.invite"] },
];
const mine = ["students.read", "users.invite", "users.manage", "roles.assign", "roles.manage"];

describe("removing roles from a person", () => {
  it("warns when the signed-in user removes a role that carries their own staff access", () => {
    expect(removalCostsOwnStaffAccess(["admin"], roles, mine, true)).toBe(true);
    expect(removalCostsOwnStaffAccess(["inviter"], roles, mine, true)).toBe(true);
  });

  it("does not warn when the removed role gives no staff access", () => {
    expect(removalCostsOwnStaffAccess(["registrar"], roles, mine, true)).toBe(false);
  });

  it("does not warn for another person, whatever the role", () => {
    expect(removalCostsOwnStaffAccess(["admin"], roles, mine, false)).toBe(false);
  });

  it("does not warn when the signed-in user does not hold the access anyway", () => {
    expect(removalCostsOwnStaffAccess(["inviter"], roles, ["students.read"], true)).toBe(false);
  });
});
