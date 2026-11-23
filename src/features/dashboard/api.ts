// The admin dashboard (ADR 0025, slice 4). One read for the current term, typed by the generated client from docs/openapi/v1.json.
// Money is integer kobo. The term comes from the school's current session, not from the browser.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type AdminDashboardView = components["schemas"]["AdminDashboardView"];

/** The current term of the current session, or null when the school has none set. */
export function currentTermQuery() {
  return {
    queryKey: ["current-term"] as const,
    queryFn: async (): Promise<string | null> => {
      const sessions = unwrap(await apiClient.GET("/api/v1/sessions"));
      const session = sessions.find((s) => s.isCurrent);
      if (!session) return null;
      const terms = unwrap(
        await apiClient.GET("/api/v1/sessions/{id}/terms", {
          params: { path: { id: session.id } },
        }),
      );
      return terms.find((t) => t.isCurrent)?.id ?? null;
    },
  };
}

export function adminDashboardQuery(termId: string) {
  return {
    queryKey: ["dashboard-admin", termId] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/dashboard/admin", { params: { query: { termId } } })),
  };
}
