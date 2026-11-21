// Rules for the people and roles screens. Permission names come from the catalogue (GET /permissions)
// and from GET /me. Nothing here checks role names: the server decides what each person may do, and
// these helpers decide only what a screen offers. The server's answer is always the one that counts.

export const PERMISSION = {
  inviteUsers: "users.invite",
  manageUsers: "users.manage",
  assignRoles: "roles.assign",
  manageRoles: "roles.manage",
  academicsRead: "academics.read",
  academicsManage: "academics.manage",
  settingsManage: "settings.manage",
} as const;

export const PEOPLE_PAGE_SIZE = 20;

/** Whether the user holds at least one of the permissions. */
export function holdsAny(granted: readonly string[], anyOf: readonly string[]): boolean {
  return anyOf.some((p) => granted.includes(p));
}

/**
 * Escalation rule (FEATURE_SPEC, users): a user may assign a role only when every permission the role
 * holds is one the user holds. The school administrator's exception is decided by the server.
 */
export function canGrantRole(
  role: { permissions: readonly string[] },
  mine: readonly string[],
): boolean {
  return role.permissions.every((p) => mine.includes(p));
}

/** Whether the custom-role feature is in the school's plan (GET /me/tenant entitlements). */
export function hasCustomRoles(entitlements: readonly string[]): boolean {
  return entitlements.includes("customRoles");
}

/**
 * Editing a role: a permission can be toggled only by someone who holds it. The server enforces the
 * same rule; the screen disables what it would refuse.
 */
export function canToggleRolePermission(permission: string, mine: readonly string[]): boolean {
  return mine.includes(permission);
}

export interface PeopleQuery {
  q: string;
  page: number;
}

/** The people list's state, read from and written to the URL, so a filtered view can be shared. */
export function parsePeopleQuery(params: URLSearchParams): PeopleQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const parsed = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
  return { q, page };
}

export function peopleQueryParams(state: PeopleQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q !== "") params.set("q", state.q);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

/** Contact details for an invitation: at least one of email or phone. */
export function hasContact(email: string, phone: string): boolean {
  return email.trim() !== "" || phone.trim() !== "";
}
