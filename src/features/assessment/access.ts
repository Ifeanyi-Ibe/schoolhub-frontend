// Assessment permissions, read from GET /me. These decide what the screens show; the API decides what is allowed. Never a role
// name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { holdsAny } from "@/features/staff/rules";
import { ASSESSMENT_PERMISSION } from "./rules";

export function useAssessmentAccess() {
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
    canEnter: has(ASSESSMENT_PERMISSION.enter) && open,
    canApprove: has(ASSESSMENT_PERMISSION.approve) && open,
    canView: has(ASSESSMENT_PERMISSION.enter, ASSESSMENT_PERMISSION.approve),
    readOnlyNotice: readOnly || suspended,
  };
}
