// Announcements (ADR 0025, slice 2): create, edit, audience preview, send and cancel. Typed by the generated client from
// docs/openapi/v1.json. Create and send carry an Idempotency-Key (the contract declares it); the others do not.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type AnnouncementView = components["schemas"]["AnnouncementView"];
export type AnnouncementBody = components["schemas"]["AnnouncementBody"];
export type AudienceBody = components["schemas"]["AudienceBody"];
export type AudiencePreviewView = components["schemas"]["AudiencePreviewView"];
export type SendOutcome = components["schemas"]["SendOutcome"];

export const ANNOUNCEMENT_PAGE_SIZE = 20;

export function announcementsQuery(page: number) {
  return {
    queryKey: ["announcements", page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/announcements", {
          params: { query: { page, pageSize: ANNOUNCEMENT_PAGE_SIZE } },
        }),
      ),
  };
}

export async function createAnnouncement(
  body: AnnouncementBody,
  idempotencyKey: string,
): Promise<AnnouncementView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/announcements", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/announcements", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body,
    }),
  );
}

export async function updateAnnouncement(
  id: string,
  body: AnnouncementBody,
): Promise<AnnouncementView> {
  return unwrap(
    await apiClient.PUT("/api/v1/announcements/{id}", { params: { path: { id } }, body }),
  );
}

/** Who would receive the announcement, and what it would cost in SMS units. Read only; nothing is sent. */
export async function previewAudience(body: AudienceBody): Promise<AudiencePreviewView> {
  return unwrap(await apiClient.POST("/api/v1/announcements/audience-preview", { body }));
}

export async function sendAnnouncement(id: string, idempotencyKey: string): Promise<SendOutcome> {
  writePolicyHeaders({ method: "POST", path: `/api/v1/announcements/${id}/send`, idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/announcements/{id}/send", {
      params: { path: { id }, header: { "Idempotency-Key": idempotencyKey } },
    }),
  );
}

export async function cancelAnnouncement(
  id: string,
  reason: string | null,
): Promise<AnnouncementView> {
  return unwrap(
    await apiClient.POST("/api/v1/announcements/{id}/cancel", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}
