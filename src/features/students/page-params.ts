// The list's URL parameters, shared by the page (server) and the list view (client). Kept in one place so the
// prefetched query and the screen read the same key.
const STATUSES = [
  "Applicant",
  "Active",
  "Suspended",
  "Withdrawn",
  "Transferred",
  "Graduated",
] as const;

export interface StudentsPageState {
  q: string;
  status: string;
  classArmId: string;
  page: number;
}

export function parseStudentsPage(
  raw: Record<string, string | string[] | undefined>,
): StudentsPageState {
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : "";
  };
  const page = Number(get("page") || "1");
  const status = get("status");
  return {
    q: get("q").slice(0, 100),
    status: (STATUSES as readonly string[]).includes(status) ? status : "",
    classArmId: get("classArmId"),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function studentsPageParams(state: StudentsPageState): Record<string, string | number> {
  return {
    ...(state.q !== "" ? { q: state.q } : {}),
    ...(state.status !== "" ? { status: state.status } : {}),
    ...(state.classArmId !== "" ? { classArmId: state.classArmId } : {}),
    page: state.page,
    pageSize: 20,
  };
}
