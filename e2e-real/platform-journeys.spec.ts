// The platform area (ADR 0027) against the real backend. It signs in as platform staff with the password and the TOTP code, reads
// the schools and the metrics, and checks the token separation in both directions (security review, finding F5, gap B-51). Nothing is
// changed: no school is suspended or reactivated here.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";
import { platformLogin, platformVerify } from "./support/platform";
import { freshTotp } from "./support/totp";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const bearer = (token: string) => ({ "X-Bff-Key": e2e.bffKey, Authorization: `Bearer ${token}` });

test.describe("the platform against the real backend", () => {
  test("platform staff sign in with the password and the code, and read the schools and metrics", async ({
    request,
  }) => {
    const first = await platformLogin(request);
    expect(first.status).toBe(200);
    expect(first.body.mfaRequired).toBe(true);
    const code = await freshTotp(e2e.platformTotpSecret);
    const second = await platformVerify(request, first.body.mfaToken ?? "", code);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const token = second.body.accessToken ?? "";
    expect(token).not.toBe("");

    const tenants = await request.get(url("/api/v1/platform/tenants?page=1&pageSize=20"), {
      headers: bearer(token),
      failOnStatusCode: false,
    });
    expect(tenants.status(), await tenants.text()).toBe(200);
    const metrics = await request.get(url("/api/v1/platform/metrics"), {
      headers: bearer(token),
      failOnStatusCode: false,
    });
    expect(metrics.status(), await metrics.text()).toBe(200);
  });

  test("a school token is refused on the platform, and a platform token on the school (B-51)", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const schoolOnPlatform = await request.get(url("/api/v1/platform/tenants"), {
      headers: {
        "X-Bff-Key": e2e.bffKey,
        "X-Tenant": e2e.schoolSlug,
        Authorization: `Bearer ${admin}`,
      },
      failOnStatusCode: false,
    });
    expect(
      [401, 403],
      `a school token reached the platform: ${schoolOnPlatform.status()}`,
    ).toContain(schoolOnPlatform.status());

    const first = await platformLogin(request);
    const second = await platformVerify(
      request,
      first.body.mfaToken ?? "",
      await freshTotp(e2e.platformTotpSecret),
    );
    const platformToken = second.body.accessToken ?? "";
    const platformOnSchool = await request.get(url("/api/v1/students"), {
      headers: {
        "X-Bff-Key": e2e.bffKey,
        "X-Tenant": e2e.schoolSlug,
        Authorization: `Bearer ${platformToken}`,
      },
      failOnStatusCode: false,
    });
    expect(
      [401, 403],
      `a platform token reached a school route: ${platformOnSchool.status()}`,
    ).toContain(platformOnSchool.status());
  });
});
