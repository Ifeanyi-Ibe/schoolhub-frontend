// The staff inbox and notification preferences (ADR 0025, slice 1). Typed by the generated client from docs/openapi/v1.json.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type InboxView = components["schemas"]["InboxView"];
export type InboxItem = components["schemas"]["InboxItem"];
export type PreferencesView = components["schemas"]["PreferencesView"];
export type PreferenceItem = components["schemas"]["PreferenceItem"];

export const INBOX_PAGE_SIZE = 20;

export function inboxQuery(page: number, unreadOnly: boolean) {
  return {
    queryKey: ["inbox", page, unreadOnly] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/me/notifications", {
          params: { query: { page, pageSize: INBOX_PAGE_SIZE, unreadOnly } },
        }),
      ),
  };
}

export async function markRead(id: string): Promise<InboxItem> {
  return unwrap(
    await apiClient.POST("/api/v1/me/notifications/{id}/read", { params: { path: { id } } }),
  );
}

export async function markAllRead(): Promise<{ marked: number | string }> {
  return unwrap(await apiClient.POST("/api/v1/me/notifications/read-all"));
}

export function preferencesQuery() {
  return {
    queryKey: ["notification-preferences"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/me/notification-preferences")),
  };
}

/** Saves the preferences that changed. The answer is the full list as the server holds it. */
export async function savePreferences(
  changes: Array<{ category: string; channel: string; enabled: boolean }>,
): Promise<PreferencesView> {
  return unwrap(
    await apiClient.PUT("/api/v1/me/notification-preferences", { body: { items: changes } }),
  );
}
