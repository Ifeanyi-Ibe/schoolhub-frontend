// Platform staff: the sign-in steps and the platform's tenant and metrics operations (ADR 0027). Sign-in calls the platform's own BFF
// routes; the answers carry a step, never a token.
import { unwrap } from "@/lib/api/unwrap";
import { platformClient } from "@/lib/api/platform-client";
import { CSRF_HEADER_NAME } from "@/lib/api/csrf";
import type { components, paths } from "@/lib/api/schema";

/** The tenant statuses the contract allows (generated, never written by hand). */
export type TenantStatus = NonNullable<
  NonNullable<paths["/api/v1/platform/tenants"]["get"]["parameters"]["query"]>["status"]
>;

export type TenantView = components["schemas"]["TenantView"];
export type PlatformMetricsView = components["schemas"]["PlatformMetricsView"];

export type PlatformStep = "mfa" | "enrol" | "signedIn";

export type SignInAnswer =
  | { ok: true; step: PlatformStep }
  | { ok: false; status: number; message: string; retryAfterSeconds?: number };

async function postStep(path: string, body: unknown): Promise<SignInAnswer> {
  const res = await fetch(`/api/bff/platform/auth/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", [CSRF_HEADER_NAME]: "1" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    step?: PlatformStep;
    message?: string;
    retryAfterSeconds?: number;
  };
  if (res.ok && data.step) return { ok: true, step: data.step };
  return {
    ok: false,
    status: res.status,
    message: data.message ?? "The sign-in did not work. Check your details and try again.",
    ...(data.retryAfterSeconds !== undefined ? { retryAfterSeconds: data.retryAfterSeconds } : {}),
  };
}

export const platformPassword = (identifier: string, password: string) =>
  postStep("login", { identifier, password });
export const platformMfa = (code: string) => postStep("mfa/verify", { code });

export async function platformSignOut(): Promise<void> {
  await fetch("/api/bff/platform/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER_NAME]: "1" },
  });
}

export function platformTenantsQuery(status: TenantStatus | "", page: number) {
  return {
    queryKey: ["platform-tenants", status, page] as const,
    queryFn: async () =>
      unwrap(
        await platformClient.GET("/api/v1/platform/tenants", {
          params: { query: { page, pageSize: 20, ...(status ? { status } : {}) } },
        }),
      ),
  };
}

export function platformTenantQuery(id: string) {
  return {
    queryKey: ["platform-tenant", id] as const,
    queryFn: async () =>
      unwrap(
        await platformClient.GET("/api/v1/platform/tenants/{id}", { params: { path: { id } } }),
      ),
  };
}

export async function suspendTenant(id: string, reason: string): Promise<TenantView> {
  return unwrap(
    await platformClient.POST("/api/v1/platform/tenants/{id}/suspend", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}

export async function reactivateTenant(id: string): Promise<TenantView> {
  return unwrap(
    await platformClient.POST("/api/v1/platform/tenants/{id}/reactivate", {
      params: { path: { id } },
    }),
  );
}

export function platformMetricsQuery() {
  return {
    queryKey: ["platform-metrics"] as const,
    queryFn: async () => unwrap(await platformClient.GET("/api/v1/platform/metrics")),
  };
}
