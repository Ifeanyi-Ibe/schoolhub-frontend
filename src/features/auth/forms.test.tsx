import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./forms";
import { postAuth } from "./http";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./http", () => ({ postAuth: vi.fn() }));

const mocked = vi.mocked(postAuth);

async function submit(identifier = "someone@example.test", password = "a-long-password") {
  await userEvent.type(screen.getByLabelText(/Email or phone/), identifier);
  await userEvent.type(screen.getByLabelText(/Password/), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  replace.mockReset();
  mocked.mockReset();
});

describe("LoginForm", () => {
  it("shows the same message for an unknown account and a wrong password (no enumeration)", async () => {
    mocked.mockResolvedValue({
      ok: false,
      status: 401,
      code: "auth.invalid_credentials",
      retryAfter: null,
    });
    const { unmount } = renderWithProviders(<LoginForm next="/home" />);
    await submit("unknown@example.test");
    const first = await screen.findByRole("alert");
    const firstText = first.textContent;
    unmount();

    mocked.mockResolvedValue({
      ok: false,
      status: 401,
      code: "auth.invalid_credentials",
      retryAfter: null,
    });
    renderWithProviders(<LoginForm next="/home" />);
    await submit("known@example.test", "wrong-password-1");
    expect((await screen.findByRole("alert")).textContent).toBe(firstText);
    expect(firstText).toMatch(/could not sign you in/i);
    expect(firstText).not.toMatch(/exist|unknown|not found|wrong password/i);
  });

  it("clears the password field after a failed attempt", async () => {
    mocked.mockResolvedValue({
      ok: false,
      status: 401,
      code: "auth.invalid_credentials",
      retryAfter: null,
    });
    renderWithProviders(<LoginForm next="/home" />);
    await submit();
    await screen.findByRole("alert");
    expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe("");
  });

  it("counts down a rate limit and keeps submit disabled until it ends", async () => {
    mocked.mockResolvedValue({
      ok: false,
      status: 429,
      code: "auth.account_locked",
      retryAfter: 5,
    });
    renderWithProviders(<LoginForm next="/home" />);
    await submit();
    expect(await screen.findByText(/Try again in 5 s/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("names the suspended school read-only state in plain words", async () => {
    mocked.mockResolvedValue({
      ok: false,
      status: 402,
      code: "billing.suspended",
      retryAfter: null,
    });
    renderWithProviders(<LoginForm next="/home" />);
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/suspended/i);
  });

  it("goes home after a full sign-in", async () => {
    mocked.mockResolvedValue({ ok: true, status: 200, body: { status: "signed_in" } });
    renderWithProviders(<LoginForm next="/sessions" />);
    await submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sessions"));
  });

  it("routes to the second step when MFA is required, keeping the return path", async () => {
    mocked.mockResolvedValue({ ok: true, status: 200, body: { status: "mfa_required" } });
    renderWithProviders(<LoginForm next="/profile" />);
    await submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/mfa?next=%2Fprofile"));
  });

  it("routes an account that must enrol MFA to enrolment only", async () => {
    mocked.mockResolvedValue({ ok: true, status: 200, body: { status: "enrollment_required" } });
    renderWithProviders(<LoginForm next="/home" />);
    await submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/enroll?next=%2Fhome"));
  });

  it("sends only the two fields and never a token", async () => {
    mocked.mockResolvedValue({ ok: true, status: 200, body: { status: "signed_in" } });
    renderWithProviders(<LoginForm next="/home" />);
    await submit("a@example.test", "a-long-password");
    await waitFor(() =>
      expect(mocked).toHaveBeenCalledWith("login", {
        identifier: "a@example.test",
        password: "a-long-password",
      }),
    );
  });
});
