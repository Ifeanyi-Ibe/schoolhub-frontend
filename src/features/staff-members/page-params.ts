// The staff list's URL parameters, shared by the page (server) and the list view (client). Kept in one place so the
// prefetched query and the screen read the same key.
import { STAFF_STATUSES, STAFF_TYPES } from "./rules";

export interface StaffPageState {
  q: string;
  staffType: string;
  status: string;
  page: number;
}

export function parseStaffPage(raw: Record<string, string | string[] | undefined>): StaffPageState {
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : "";
  };
  const page = Number(get("page") || "1");
  const type = get("type");
  const status = get("status");
  return {
    q: get("q").slice(0, 100),
    staffType: (STAFF_TYPES as readonly string[]).includes(type) ? type : "",
    status: (STAFF_STATUSES as readonly string[]).includes(status) ? status : "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The URL query for a state. Defaults are left out, so the plain list has a clean address. */
export function staffPageSearch(state: StaffPageState): string {
  const p = new URLSearchParams();
  if (state.q !== "") p.set("q", state.q);
  if (state.staffType !== "") p.set("type", state.staffType);
  if (state.status !== "") p.set("status", state.status);
  if (state.page > 1) p.set("page", String(state.page));
  return p.toString();
}
