// Attendance permissions, read from GET /me. These decide what the screens show; the API decides what is allowed.
// Never a role name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { holdsAny } from "@/features/staff/rules";
import { ATTENDANCE_PERMISSION } from "./rules";

export function useAttendanceAccess() {
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
    canMark: has(ATTENDANCE_PERMISSION.mark) && open,
    canReadMark: has(ATTENDANCE_PERMISSION.mark),
    canEditPast: has(ATTENDANCE_PERMISSION.editPast) && open,
    canExport: has(ATTENDANCE_PERMISSION.export),
    readOnlyNotice: readOnly || suspended,
  };
}
