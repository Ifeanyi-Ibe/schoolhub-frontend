// Staff permissions, read from GET /me. These decide what the screens show; the API decides what is allowed.
// Never a role name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { holdsAny } from "@/features/staff/rules";
import { STAFF_PERMISSION } from "./rules";

export function useStaffAccess() {
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const readOnly = useReadOnly();
  const granted = me.data?.permissions ?? [];
  const has = (...p: string[]) => me.data !== undefined && holdsAny(granted, p);
  const suspended = tenant.data?.suspended === true;
  const open = !readOnly && !suspended;
  return {
    loading: me.data === undefined && !me.isError,
    failed: me.isError,
    canRead: has(STAFF_PERMISSION.read),
    writable: has(STAFF_PERMISSION.write) && open,
    canAssign: has(STAFF_PERMISSION.assign) && open,
    canAssignRead: has(STAFF_PERMISSION.assign),
    canManageUsers: has(STAFF_PERMISSION.usersManage) && open,
    canInvite: has(STAFF_PERMISSION.invite) && open,
    readOnlyNotice: readOnly || suspended,
  };
}
