import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { postAuth } from "./http";
import { ResetForm, forgetOneTimeTokenForTests } from "./forms";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./http", () => ({ postAuth: vi.fn() }));
const mocked = vi.mocked(postAuth);

const TOKEN = "0123456789abcdef-token";

beforeEach(() => {
  forgetOneTimeTokenForTests();
  mocked.mockReset();
  replace.mockReset();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

async function submitNewPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^New password/), "a-long-new-password");
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}

describe("reset link tokens (B-18)", () => {
  it("accepts the token from the fragment, removes it from the address bar, and sends it only to the reset call", async () => {
    window.history.replaceState(null, "", `/reset-password?school=demo#token=${TOKEN}`);
    mocked.mockResolvedValue({ ok: true, status: 204 } as never);
    const user = userEvent.setup();
    renderWithProviders(<ResetForm />);

    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?school=demo");
    await submitNewPassword(user);
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect(mocked.mock.calls[0]?.[1]).toMatchObject({ token: TOKEN });
  });

  it("accepts the interim token from the query string, and removes it from the address bar at once", async () => {
    window.history.replaceState(null, "", `/reset-password?school=demo&token=${TOKEN}`);
    mocked.mockResolvedValue({ ok: true, status: 204 } as never);
    const user = userEvent.setup();
    renderWithProviders(<ResetForm />);

    expect(window.location.search).toBe("?school=demo");
    expect(window.location.href).not.toContain(TOKEN);
    await submitNewPassword(user);
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect(mocked.mock.calls[0]?.[1]).toMatchObject({ token: TOKEN });
  });

  it("shows the incomplete-link message and no form when the link has no token", () => {
    window.history.replaceState(null, "", "/reset-password?school=demo");
    renderWithProviders(<ResetForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link is incomplete. Request a new one.",
    );
    expect(screen.queryByLabelText(/^New password/)).toBeNull();
    expect(mocked).not.toHaveBeenCalled();
  });
});
