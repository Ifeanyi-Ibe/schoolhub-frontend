import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ForgotForm, LoginForm, MfaForm, OtpForm } from "./forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./http", () => ({ postAuth: vi.fn() }));

// Colour contrast is checked against the real tokens in src/lib/theme/tokens.test.ts; jsdom cannot
// compute it reliably, so that one rule is disabled here.
async function expectNoViolations(el: HTMLElement) {
  const results = await axe.run(el, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe("auth forms accessibility (axe)", () => {
  it("login", async () => {
    const { container } = renderWithProviders(<LoginForm next="/home" />);
    await expectNoViolations(container);
  });
  it("otp request step", async () => {
    const { container } = renderWithProviders(<OtpForm next="/home" />);
    await expectNoViolations(container);
  });
  it("mfa", async () => {
    const { container } = renderWithProviders(<MfaForm next="/home" />);
    await expectNoViolations(container);
  });
  it("forgot password", async () => {
    const { container } = renderWithProviders(<ForgotForm />);
    await expectNoViolations(container);
  });
});
