// Student permissions, read from GET /me. These decide what the screens show; the API decides what is allowed.
// Never a role name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { holdsAny } from "@/features/staff/rules";
import { STUDENT_PERMISSION } from "./rules";

export function useStudentAccess() {
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const readOnly = useReadOnly();
  const granted = me.data?.permissions ?? [];
  const has = (...p: string[]) => me.data !== undefined && holdsAny(granted, p);
  const suspended = tenant.data?.suspended === true;
  const writable = has(STUDENT_PERMISSION.write) && !readOnly && !suspended;
  return {
    loading: me.data === undefined && !me.isError,
    failed: me.isError,
    canRead: has(STUDENT_PERMISSION.read),
    writable,
    canSensitive: has(STUDENT_PERMISSION.sensitiveRead),
    canDelete: has(STUDENT_PERMISSION.delete) && !readOnly && !suspended,
    canNotesRead: has(STUDENT_PERMISSION.notesRead),
    canNotesWrite: has(STUDENT_PERMISSION.notesWrite) && !readOnly && !suspended,
    canOverrideDuplicate: has(STUDENT_PERMISSION.duplicatesOverride),
    canLifecycle: has(STUDENT_PERMISSION.lifecycle) && !readOnly && !suspended,
    canImport: has(STUDENT_PERMISSION.importRun) && !readOnly && !suspended,
    canPromote: has(STUDENT_PERMISSION.promotions) && !readOnly && !suspended,
    readOnlyNotice: readOnly || suspended,
  };
}
