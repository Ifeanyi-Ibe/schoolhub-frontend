// Typed reads for the shell and account screens. Every call goes through the single error
// boundary (unwrap), so failures arrive as ApiError with the tolerant problem.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";

export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/me")),
};

export const tenantQuery = {
  queryKey: ["tenant"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/me/tenant")),
};

export const sessionsQuery = {
  queryKey: ["sessions"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/me/sessions")),
};
