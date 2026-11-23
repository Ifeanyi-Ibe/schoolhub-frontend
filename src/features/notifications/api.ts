// Notification templates, the message log, statistics and the SMS wallet (ADR 0025, slice 3). Typed by the generated client from
// docs/openapi/v1.json. Retry carries an Idempotency-Key (the contract declares it); the others do not.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type TemplateView = components["schemas"]["TemplateView"];
export type MessageView = components["schemas"]["MessageView"];
export type StatsView = components["schemas"]["StatsView"];
export type WalletView = components["schemas"]["WalletView"];
export type PreviewView = components["schemas"]["PreviewView"];

export const MESSAGE_PAGE_SIZE = 20;

export function templatesQuery() {
  return {
    queryKey: ["notification-templates"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/notifications/templates")),
  };
}

export async function saveTemplate(
  key: string,
  body: { subject: string | null; body: string },
): Promise<TemplateView> {
  return unwrap(
    await apiClient.PUT("/api/v1/notifications/templates/{key}", {
      params: { path: { key } },
      body,
    }),
  );
}

/** Puts a template back to the school's default text. The answer is the template as it now is. */
export async function resetTemplate(key: string): Promise<TemplateView> {
  return unwrap(
    await apiClient.DELETE("/api/v1/notifications/templates/{key}", { params: { path: { key } } }),
  );
}

/** Renders a draft template with its variables. Nothing is sent. */
export async function previewTemplate(
  key: string,
  body: { subject: string | null; body: string | null },
): Promise<PreviewView> {
  return unwrap(
    await apiClient.POST("/api/v1/notifications/templates/{key}/preview", {
      params: { path: { key } },
      body,
    }),
  );
}

export function messagesQuery(page: number, status: string, channel: string) {
  return {
    queryKey: ["notification-messages", page, status, channel] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/notifications/messages", {
          params: {
            query: {
              page,
              pageSize: MESSAGE_PAGE_SIZE,
              ...(status ? { status } : {}),
              ...(channel ? { channel } : {}),
            },
          },
        }),
      ),
  };
}

export async function retryMessage(id: string, idempotencyKey: string): Promise<MessageView> {
  writePolicyHeaders({
    method: "POST",
    path: `/api/v1/notifications/messages/${id}/retry`,
    idempotencyKey,
  });
  return unwrap(
    await apiClient.POST("/api/v1/notifications/messages/{id}/retry", {
      params: { path: { id }, header: { "Idempotency-Key": idempotencyKey } },
    }),
  );
}

export function statsQuery(days: number) {
  return {
    queryKey: ["notification-stats", days] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/notifications/stats", { params: { query: { days } } })),
  };
}

export function walletQuery() {
  return {
    queryKey: ["sms-wallet"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/notifications/sms-wallet")),
  };
}
