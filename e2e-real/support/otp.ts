// Reads the one-time code from the backend's Development-only messages endpoint
// (docs/backend/DEV_SEED.md). The route does not exist in Staging or Production.
import type { APIRequestContext } from "@playwright/test";
import { e2e } from "./env";

export async function latestOtpCode(request: APIRequestContext, phone: string): Promise<string> {
  const res = await request.get(
    `${e2e.apiBaseUrl}/api/v1/dev/messages/latest?to=${encodeURIComponent(phone)}`,
    {
      headers: { "X-Tenant": e2e.schoolSlug },
    },
  );
  if (res.status() !== 200) throw new Error(`dev messages endpoint answered ${res.status()}`);
  const body = String(((await res.json()) as { body?: string }).body ?? "");
  const code = /Your code is (\d{6})/.exec(body)?.[1];
  if (!code) throw new Error("no six-digit code found in the latest message");
  return code;
}
