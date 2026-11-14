// Shared Playwright `test` for every browser journey. Any console error, uncaught page error or CSP
// violation fails the test. The only console errors ignored are the browser's own log of a
// deliberate 4xx from the BFF (for example a wrong password, or a rate limit), which the journey
// asserts on in the UI.
import { test as base, expect } from "@playwright/test";

const EXPECTED_BFF_STATUS =
  /Failed to load resource: the server responded with a status of (4\d\d)/;

export const test = base.extend<{ allowOfflineNetwork: boolean }>({
  // Set by a journey that goes offline on purpose: the browser logs its prefetches as failed.
  allowOfflineNetwork: [false, { option: true }],
  page: async ({ page, allowOfflineNetwork }, use) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const expected = EXPECTED_BFF_STATUS.exec(msg.text());
      if (expected && msg.location().url.includes("/api/bff/")) return;
      if (allowOfflineNetwork && msg.text().includes("net::ERR_INTERNET_DISCONNECTED")) return;
      problems.push(`console error: ${msg.text()} (${msg.location().url || "no url"})`);
    });
    page.on("pageerror", (err) => problems.push(`uncaught page error: ${err.message}`));
    // CSP violations are reported to the page as events, so they are surfaced as errors here.
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || "inline"}`);
      });
    });
    // Playwright fixture callback (not a React hook).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    expect(problems, "browser errors during this journey").toEqual([]);
  },
});

export { expect };
