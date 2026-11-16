// Removing roles from a person. The server is authoritative: it refuses removing the last SchoolAdmin and
// the immutable SchoolAdmin role (BACKEND_GAPS B-20), and the screen shows the code it returns. These helpers
// decide only what to warn about before the request is made.
//
// The warning does not look at role names. A role is "staff access" when it grants one of the permissions
// that run this screen, so the warning follows what the role does, not what it is called.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { PERMISSION } from "./rules";

/** The permissions that let a person run the people and roles screens. */
export const STAFF_ACCESS_PERMISSIONS: readonly string[] = [
  PERMISSION.inviteUsers,
  PERMISSION.manageUsers,
  PERMISSION.assignRoles,
  PERMISSION.manageRoles,
];

export interface RoleRef {
  id: string;
  permissions: readonly string[];
}

/**
 * True when the person is the signed-in user and removing these roles would take away staff access they
 * hold now. The check uses the removed roles' permissions and the user's own permissions from GET /me.
 */
export function removalCostsOwnStaffAccess(
  removedRoleIds: readonly string[],
  roles: readonly RoleRef[],
  mine: readonly string[],
  isSelf: boolean,
): boolean {
  if (!isSelf) return false;
  const removedPermissions = new Set(
    roles.filter((r) => removedRoleIds.includes(r.id)).flatMap((r) => [...r.permissions]),
  );
  return STAFF_ACCESS_PERMISSIONS.some((p) => removedPermissions.has(p) && mine.includes(p));
}

export interface UserRolesInput {
  roleIds: string[];
}

/** Sets a person's roles to exactly these ids. Removing a role is setting the list without it. */
export async function setUserRoles(userId: string, roleIds: string[]) {
  return unwrap(
    await apiClient.PUT("/api/v1/users/{id}/roles", {
      params: { path: { id: userId } },
      body: { roleIds },
    }),
  );
}
