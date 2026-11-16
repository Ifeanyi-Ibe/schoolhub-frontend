// The sign-in rate limit with the backend's REAL limits (the one journey that needs them). Runs only when
// the backend was started without E2E__RelaxLimits: scripts/dev-backend.sh --real-limits, then
// E2E_REAL_LIMITS=1 npm run test:real. It runs last (zz-) so its attempts cannot slow other journeys.
// It uses an account that does not exist, so no seeded account is locked.
import { test, expect } from "../e2e/fixtures";

test.describe("sign-in rate limit with real limits", () => {
  test.skip(
    process.env.E2E_REAL_LIMITS !== "1",
    "needs a backend started with scripts/dev-backend.sh --real-limits and E2E_REAL_LIMITS=1",
  );

  test("too many attempts show a countdown, and submit stays disabled until it ends", async ({
    page,
  }) => {
    await page.goto("/login");
    const identifier = `nobody-${Date.now().toString(36)}@test.invalid`;
    await page.getByLabel(/Email or phone/).fill(identifier);
    await page.getByLabel(/^Password/).fill("not-the-password-123");
    const submit = page.getByRole("button", { name: "Sign in" });
    // The backend allows about ten auth calls a minute per address; stop when the countdown appears.
    // Each attempt waits for its own response: the form ignores a click while a request is in flight.
    for (let i = 0; i < 15; i++) {
      // The form clears the password after a failed attempt, so each attempt types it again.
      await page.getByLabel(/^Password/).fill("not-the-password-123");
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/auth/login")),
        submit.click(),
      ]);
      if (await page.getByText(/Too many attempts/).isVisible()) break;
    }
    const message = page.getByText(/Too many attempts/);
    await expect(message).toBeVisible();
    await expect(message).toContainText(/try again in \d+ seconds/);
    await expect(submit).toBeDisabled();
  });
});
