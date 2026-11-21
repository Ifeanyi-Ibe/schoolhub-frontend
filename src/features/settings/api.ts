// School settings: school profile, branding and policies. Reads are typed by the generated client. The PUT
// request bodies are declared as a bare object in the contract (BACKEND_GAPS B-28), so the screens send the
// full view they read, with the same field names. No idempotency or If-Match is declared, so none is sent.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type SchoolProfile = components["schemas"]["SchoolProfileView"];
export type Branding = components["schemas"]["BrandingSettingsView"];
export type Policies = components["schemas"]["PoliciesView"];

export const schoolProfileQuery = {
  queryKey: ["settings", "school-profile"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/settings/school-profile")),
};
export const brandingQuery = {
  queryKey: ["settings", "branding"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/settings/branding")),
};
export const policiesQuery = {
  queryKey: ["settings", "policies"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/settings/policies")),
};

export async function saveSchoolProfile(input: SchoolProfile) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/settings/school-profile" });
  return unwrap(
    await apiClient.PUT("/api/v1/settings/school-profile", {
      body: input as unknown as Record<string, never>,
      headers: policy.headers,
    }),
  );
}

export async function saveBranding(input: Branding) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/settings/branding" });
  return unwrap(
    await apiClient.PUT("/api/v1/settings/branding", {
      body: input as unknown as Record<string, never>,
      headers: policy.headers,
    }),
  );
}

export async function savePolicies(input: Policies) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/settings/policies" });
  return unwrap(
    await apiClient.PUT("/api/v1/settings/policies", {
      body: input as unknown as Record<string, never>,
      headers: policy.headers,
    }),
  );
}
