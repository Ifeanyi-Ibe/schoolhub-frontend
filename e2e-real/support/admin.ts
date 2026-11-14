// Setup and checks against the REAL backend (Development), called directly with the BFF key. These
// create the data a journey needs and undo what they change. The journeys themselves sign in, change
// passwords and accept invitations through the BFF, the product path. Every call uses an operation
// in docs/openapi/v1.json, and every created account and school uses a unique, non-real address.
import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { e2e } from "./env";
import { freshTotp } from "./totp";
import { platformLogin, platformVerify } from "./platform";

const url = (path: string) => `${e2e.apiBaseUrl}${path}`;

// X-Tenant names the school a school-scoped call acts on. Platform calls send none: a school that is
// being created does not exist yet, and naming it would be answered 404.
function headers(bearer?: string, tenant?: string): Record<string, string> {
  return {
    "X-Bff-Key": e2e.bffKey,
    ...(tenant ? { "X-Tenant": tenant } : {}),
    "Content-Type": "application/json",
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };
}

/** A unique, non-real address for an account this run creates. The local part starts with e2e-. */
export function runAddress(label: string): string {
  return `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** Sign in as the seeded school administrator through the backend, to act as the school. */
export async function adminAccessToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(url("/api/v1/auth/login"), {
    headers: headers(undefined, e2e.schoolSlug),
    data: { identifier: e2e.adminIdentifier, password: e2e.adminPassword },
    failOnStatusCode: false,
  });
  const body = (await res.json()) as { accessToken?: string };
  if (res.status() !== 200 || !body.accessToken)
    throw new Error(`admin sign-in answered ${res.status()}`);
  return body.accessToken;
}

/** Invite a staff user with no roles. Returns the new user's id. */
export async function inviteUser(
  request: APIRequestContext,
  adminToken: string,
  displayName: string,
  email: string,
  roleIds: string[] | null = null,
): Promise<string> {
  const res = await request.post(url("/api/v1/users/invite"), {
    headers: { ...headers(adminToken, e2e.schoolSlug), "Idempotency-Key": randomUUID() },
    data: { displayName, email, phone: null, roleIds },
    failOnStatusCode: false,
  });
  const body = (await res.json()) as { id?: string; code?: string };
  if (res.status() !== 201 || !body.id)
    throw new Error(`invite answered ${res.status()} ${body.code ?? ""}`);
  return body.id;
}

/** Lift a lockout (admin action). */
export async function unlockUser(request: APIRequestContext, adminToken: string, userId: string) {
  const res = await request.post(url(`/api/v1/users/${userId}/unlock`), {
    headers: headers(adminToken, e2e.schoolSlug),
    failOnStatusCode: false,
  });
  if (res.status() !== 200) throw new Error(`unlock answered ${res.status()}`);
}

/** The body of the newest Development message to an address (mail, SMS). Development only. */
export async function latestMessage(request: APIRequestContext, to: string): Promise<string> {
  const res = await request.get(url(`/api/v1/dev/messages/latest?to=${encodeURIComponent(to)}`), {
    headers: headers(undefined, e2e.schoolSlug),
    failOnStatusCode: false,
  });
  if (res.status() !== 200) throw new Error(`dev messages endpoint answered ${res.status()}`);
  return String(((await res.json()) as { body?: string }).body ?? "");
}

/** The platform developer's access token (password, then a TOTP code that has not been used). */
export async function platformAccessToken(request: APIRequestContext): Promise<string> {
  const first = await platformLogin(request);
  if (!first.body.mfaToken)
    throw new Error(`platform sign-in answered ${first.status} without a challenge`);
  const code = await freshTotp(e2e.platformTotpSecret);
  const second = await platformVerify(request, first.body.mfaToken, code);
  if (!second.body.accessToken) throw new Error(`platform TOTP answered ${second.status}`);
  return second.body.accessToken;
}

/** Create a school on the dev-all plan (every feature). Returns the tenant id. */
export async function createSchool(
  request: APIRequestContext,
  platformToken: string,
  slug: string,
) {
  const res = await request.post(url("/api/v1/platform/tenants"), {
    headers: { ...headers(platformToken), "Idempotency-Key": randomUUID() },
    data: { slug, name: `E2E ${slug}`, planCode: "dev-all" },
    failOnStatusCode: false,
  });
  const body = (await res.json()) as { id?: string; code?: string };
  if (res.status() !== 201 || !body.id)
    throw new Error(`create school answered ${res.status()} ${body.code ?? ""}`);
  return body.id;
}

/** Suspend or reactivate a school (platform action). */
export async function setSchoolStatus(
  request: APIRequestContext,
  platformToken: string,
  tenantId: string,
  action: "suspend" | "reactivate",
) {
  const res = await request.post(url(`/api/v1/platform/tenants/${tenantId}/${action}`), {
    headers: headers(platformToken),
    data: { reason: `e2e ${action}` },
    failOnStatusCode: false,
  });
  if (res.status() !== 200 && res.status() !== 204)
    throw new Error(`${action} answered ${res.status()}`);
}

/** The seeded school's id, from the platform list. */
export async function tenantIdBySlug(
  request: APIRequestContext,
  platformToken: string,
  slug: string,
) {
  const res = await request.get(url("/api/v1/platform/tenants?pageSize=200"), {
    headers: headers(platformToken),
  });
  const body = (await res.json()) as { items: { id: string; slug: string }[] };
  const found = body.items.find((t) => t.slug === slug);
  if (!found) throw new Error(`no school with slug ${slug}`);
  return found.id;
}

/** A user's own access token, from the backend, for a self-service call (MFA enrolment). */
export async function userAccessToken(
  request: APIRequestContext,
  identifier: string,
  password: string,
) {
  const res = await request.post(url("/api/v1/auth/login"), {
    headers: headers(undefined, e2e.schoolSlug),
    data: { identifier, password },
    failOnStatusCode: false,
  });
  return {
    status: res.status(),
    body: (await res.json()) as { accessToken?: string; mfaRequired?: boolean; mfaToken?: string },
  };
}

/** Enrol the signed-in user in MFA and confirm it with the first code. Returns the secret. */
export async function enrolMfa(request: APIRequestContext, userToken: string): Promise<string> {
  const start = await request.post(url("/api/v1/me/mfa/enroll"), {
    headers: headers(userToken, e2e.schoolSlug),
    failOnStatusCode: false,
  });
  const setup = (await start.json()) as { secret?: string; code?: string };
  if (start.status() !== 200 || !setup.secret)
    throw new Error(`MFA enrolment answered ${start.status()} ${setup.code ?? ""}`);
  const code = await freshTotp(setup.secret);
  const confirm = await request.post(url("/api/v1/me/mfa/confirm"), {
    headers: headers(userToken, e2e.schoolSlug),
    data: { code },
    failOnStatusCode: false,
  });
  if (confirm.status() !== 200) throw new Error(`MFA confirmation answered ${confirm.status()}`);
  return setup.secret;
}
