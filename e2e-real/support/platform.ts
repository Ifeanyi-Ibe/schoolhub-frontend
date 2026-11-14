// Platform sign-in through the API (the F1 UI has no platform surface; that is F8). Used to verify
// the backend's platform TOTP path and its replay protection.
import type { APIRequestContext } from "@playwright/test";
import { e2e } from "./env";

const headers = () => ({ "X-Bff-Key": e2e.bffKey, "Content-Type": "application/json" });

/** Step 1: password. Returns the MFA challenge token when the account needs a code. */
export async function platformLogin(request: APIRequestContext) {
  const res = await request.post(`${e2e.apiBaseUrl}/api/v1/platform/auth/login`, {
    headers: headers(),
    data: { identifier: e2e.platformIdentifier, password: e2e.platformPassword },
    failOnStatusCode: false,
  });
  return {
    status: res.status(),
    body: (await res.json()) as { mfaRequired?: boolean; mfaToken?: string; accessToken?: string },
  };
}

/** Step 2: the TOTP code for the challenge. */
export async function platformVerify(request: APIRequestContext, mfaToken: string, code: string) {
  const res = await request.post(`${e2e.apiBaseUrl}/api/v1/platform/auth/mfa/verify`, {
    headers: headers(),
    data: { mfaToken, code },
    failOnStatusCode: false,
  });
  return {
    status: res.status(),
    body: (await res.json()) as { accessToken?: string; code?: string },
  };
}
