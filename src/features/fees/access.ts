// Fees permissions, read from GET /me. These decide what the screens show; the API decides what is allowed.
// Never a role name (CLAUDE.md).
import { useQuery } from "@tanstack/react-query";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { holdsAny } from "@/features/staff/rules";
import { FEE_PERMISSION } from "./rules";

export function useFeeAccess() {
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
    canReports: has(FEE_PERMISSION.reportsRead),
    canStructures: has(FEE_PERMISSION.structures) && open,
    canDiscountApprove: has(FEE_PERMISSION.discountsApprove) && open,
    canInvoiceCreate: has(FEE_PERMISSION.invoicesCreate) && open,
    canInvoiceVoid: has(FEE_PERMISSION.invoicesVoid) && open,
    canRecordPayment: has(FEE_PERMISSION.paymentsRecord) && open,
    canReverse: has(FEE_PERMISSION.paymentsReverse) && open,
    canApproveReversal: has(FEE_PERMISSION.paymentsApprove) && open,
    readOnlyNotice: readOnly || suspended,
  };
}
