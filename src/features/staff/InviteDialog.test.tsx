import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { parseApiProblem } from "@/lib/api/problem";
import { ApiError } from "@/lib/api/unwrap";
import { InviteDialog } from "./InviteDialog";

const fixtures = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  roles: [
    {
      id: "r-1",
      name: "Registrar",
      description: "",
      isSystem: true,
      permissions: ["students.read"],
      memberCount: 0,
    },
    {
      id: "r-2",
      name: "Bursar",
      description: "",
      isSystem: true,
      permissions: ["fees.read"],
      memberCount: 0,
    },
  ],
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  inviteUser: fixtures.inviteUser,
  rolesQuery: { queryKey: ["roles-test"], queryFn: async () => fixtures.roles },
}));
vi.mock("@/features/shell/api", () => ({
  meQuery: {
    queryKey: ["me-test"],
    queryFn: async () => ({ permissions: ["users.invite", "students.read"] }),
  },
}));

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <QueryClientProvider client={client}>
      <InviteDialog open onOpenChange={() => undefined} />
    </QueryClientProvider>,
  );
}

async function fillName(user: ReturnType<typeof userEvent.setup>, name = "Ada Okafor") {
  await user.type(screen.getByLabelText(/Full name/), name);
}

describe("InviteDialog", () => {
  beforeEach(() => {
    fixtures.inviteUser.mockReset();
  });

  it("asks for an email address or a phone number, and sends nothing without one", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillName(user);
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(
      (await screen.findAllByText("Enter an email address or a phone number")).length,
    ).toBeGreaterThan(0);
    expect(fixtures.inviteUser).not.toHaveBeenCalled();
  });

  it("offers only the roles whose permissions the user holds, and says why the others are unavailable", async () => {
    renderDialog();
    const registrar = await screen.findByRole("checkbox", { name: /Registrar/ });
    const bursar = screen.getByRole("checkbox", { name: /Bursar/ });
    expect(registrar).toBeEnabled();
    expect(bursar).toBeDisabled();
    expect(
      screen.getByText("Not available: this role has permissions you do not hold"),
    ).toBeInTheDocument();
  });

  it("reuses the same Idempotency-Key when a refused invitation is retried unchanged", async () => {
    const user = userEvent.setup();
    fixtures.inviteUser
      .mockRejectedValueOnce(
        new ApiError(parseApiProblem(409, { code: "users.email_taken", title: "taken" })),
      )
      .mockResolvedValueOnce({ id: "u-1" });
    renderDialog();
    await fillName(user);
    await user.type(screen.getByLabelText(/Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another account already uses this email address.",
    );

    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(fixtures.inviteUser).toHaveBeenCalledTimes(2));
    const first = fixtures.inviteUser.mock.calls[0]?.[1];
    const second = fixtures.inviteUser.mock.calls[1]?.[1];
    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
  });

  it("uses a new Idempotency-Key once the details change", async () => {
    const user = userEvent.setup();
    fixtures.inviteUser
      .mockRejectedValueOnce(
        new ApiError(parseApiProblem(409, { code: "users.email_taken", title: "taken" })),
      )
      .mockResolvedValueOnce({ id: "u-2" });
    renderDialog();
    await fillName(user);
    await user.type(screen.getByLabelText(/Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByRole("alert");

    await user.clear(screen.getByLabelText(/Email/));
    await user.type(screen.getByLabelText(/Email/), "ada.okafor@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(fixtures.inviteUser).toHaveBeenCalledTimes(2));
    expect(fixtures.inviteUser.mock.calls[1]?.[1]).not.toBe(fixtures.inviteUser.mock.calls[0]?.[1]);
  });
});
