// Academic setup permissions, read from GET /me. These decide what the screen shows; the API decides what is
// allowed. Never a role name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { PERMISSION, holdsAny } from "@/features/staff/rules";

export function useAcademicsAccess() {
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const readOnly = useReadOnly();
  const granted = me.data?.permissions ?? [];
  const canRead =
    me.data !== undefined &&
    holdsAny(granted, [PERMISSION.academicsRead, PERMISSION.academicsManage]);
  const canManage = me.data !== undefined && holdsAny(granted, [PERMISSION.academicsManage]);
  const suspended = tenant.data?.suspended === true;
  return {
    loading: me.data === undefined && !me.isError,
    failed: me.isError,
    canRead,
    canManage,
    writable: canManage && !readOnly && !suspended,
    readOnlyNotice: readOnly || suspended,
  };
}
