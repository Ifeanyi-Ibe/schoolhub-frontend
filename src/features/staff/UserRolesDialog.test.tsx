import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/render";
import { parseApiProblem } from "@/lib/api/problem";
import { ApiError } from "@/lib/api/unwrap";
import { UserRolesDialog } from "./UserRolesDialog";

// A plain function, not a vi.fn: Vitest tracks rejected promises from spies and reports them as failures
// even when the component handles them. The spy-free stub records calls and returns the test's outcome.
const saved = vi.hoisted(() => ({
  calls: [] as Array<[string, string[]]>,
  outcome: (): Promise<unknown> => Promise.resolve({}),
}));
vi.mock("./user-roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./user-roles")>()),
  setUserRoles: (id: string, roleIds: string[]) => {
    saved.calls.push([id, roleIds]);
    return saved.outcome();
  },
}));

const roles = [
  {
    id: "admin",
    name: "Office lead",
    description: "",
    isSystem: false,
    permissions: ["users.invite", "roles.assign"],
    memberCount: 2,
  },
  {
    id: "teacher",
    name: "Form teacher",
    description: "",
    isSystem: false,
    permissions: ["students.read"],
    memberCount: 9,
  },
];
const person = {
  id: "p1",
  displayName: "Tunde Bello",
  email: null,
  phone: null,
  type: "Staff",
  status: "Active",
  mfaEnabled: false,
  roles: ["Office lead", "Form teacher"],
  lastLoginAt: null,
};

function renderDialog(isSelf: boolean) {
  const client = new QueryClient();
  return renderWithProviders(
    <QueryClientProvider client={client}>
      <UserRolesDialog
        person={person}
        roles={roles}
        mine={["users.invite", "roles.assign"]}
        isSelf={isSelf}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  saved.calls.length = 0;
  saved.outcome = () => Promise.resolve({});
});

describe("removing roles from a person", () => {
  it("saves nothing until a role is unticked", () => {
    renderDialog(false);
    expect(screen.getByRole("button", { name: "Save roles" })).toBeDisabled();
  });

  it("removes an unticked role, sending only the roles that remain", async () => {
    const user = userEvent.setup();
    saved.outcome = () => Promise.resolve({});
    renderDialog(false);
    await user.click(screen.getByRole("checkbox", { name: "Form teacher" }));
    await user.click(screen.getByRole("button", { name: "Save roles" }));
    await waitFor(() => expect(saved.calls).toEqual([["p1", ["admin"]]]));
  });

  it("asks for confirmation before the signed-in user removes their own staff access", async () => {
    const user = userEvent.setup();
    saved.outcome = () => Promise.resolve({});
    renderDialog(true);
    await user.click(screen.getByRole("checkbox", { name: "Office lead" }));
    expect(screen.getByText(/removes staff access from your own account/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save roles" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I understand I may lose access/ }));
    expect(save).toBeEnabled();
  });

  it("shows the backend's refusal code when the server refuses the change", async () => {
    const user = userEvent.setup();
    saved.outcome = () =>
      Promise.reject(
        new ApiError(parseApiProblem(409, { code: "test.refusal_code", title: "refused" })),
      );
    renderDialog(false);
    await user.click(screen.getByRole("checkbox", { name: "Form teacher" }));
    await user.click(screen.getByRole("button", { name: "Save roles" }));
    await waitFor(() => expect(saved.calls).toHaveLength(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("(code test.refusal_code)");
  });
});
