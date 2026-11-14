import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
import { parseApiProblem } from "@/lib/api/problem";
import { ApiError } from "@/lib/api/unwrap";
import { RoleEditor } from "./RoleEditor";
import { RolesView } from "./RolesView";

const fx = vi.hoisted(() => ({
  setRolePermissions: vi.fn(),
  me: { permissions: ["roles.manage", "users.invite"] as string[] },
  entitlements: [] as string[],
  roles: [] as Array<{
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    permissions: string[];
    memberCount: number;
  }>,
  catalogue: [
    {
      area: "Users",
      permissions: [
        { name: "users.invite", isPlatform: false },
        { name: "roles.manage", isPlatform: false },
        { name: "fees.read", isPlatform: false },
      ],
    },
  ],
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  setRolePermissions: fx.setRolePermissions,
  rolesQuery: { queryKey: ["roles-t"], queryFn: async () => fx.roles },
  permissionCatalogQuery: { queryKey: ["catalogue-t"], queryFn: async () => fx.catalogue },
}));
vi.mock("@/features/shell/api", () => ({
  meQuery: { queryKey: ["me-t"], queryFn: async () => fx.me },
  tenantQuery: { queryKey: ["tenant-t"], queryFn: async () => ({ entitlements: fx.entitlements }) },
}));

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  fx.setRolePermissions.mockReset();
  fx.me = { permissions: ["roles.manage", "users.invite"] };
  fx.entitlements = ["customRoles"];
  fx.roles = [
    {
      id: "r-custom",
      name: "Office",
      description: "",
      isSystem: false,
      permissions: ["users.invite"],
      memberCount: 0,
    },
    {
      id: "r-system",
      name: "Built-in",
      description: "",
      isSystem: true,
      permissions: ["users.invite"],
      memberCount: 1,
    },
  ];
});

describe("escalation on the role editor (UX only; the API decides)", () => {
  it("disables a permission the editor does not hold, and says so", async () => {
    renderWithProviders(
      <QueryClientProvider client={client()}>
        <RoleEditor roleId="r-custom" />
      </QueryClientProvider>,
    );
    const held = await screen.findByRole("checkbox", { name: /users\.invite/ });
    const notHeld = screen.getByRole("checkbox", { name: /fees\.read/ });
    expect(held).toBeEnabled();
    expect(notHeld).toBeDisabled();
    expect(screen.getAllByText("You do not hold this permission").length).toBeGreaterThan(0);
  });

  it("shows the backend's refusal code when the save is refused", async () => {
    const user = userEvent.setup();
    fx.setRolePermissions.mockRejectedValue(
      new ApiError(parseApiProblem(409, { code: "roles.escalation_refused", title: "refused" })),
    );
    renderWithProviders(
      <QueryClientProvider client={client()}>
        <RoleEditor roleId="r-custom" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("checkbox", { name: /roles\.manage/ }));
    await user.click(screen.getByRole("button", { name: "Save permissions" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("code roles.escalation_refused"),
    );
  });
});

describe("plan gating", () => {
  it("does not let a built-in role change when custom roles are not in the plan", async () => {
    fx.entitlements = [];
    renderWithProviders(
      <QueryClientProvider client={client()}>
        <RoleEditor roleId="r-system" />
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: /Role: Built-in/ });
    expect(screen.queryByRole("button", { name: "Save permissions" })).toBeNull();
    expect(await screen.findByRole("checkbox", { name: /users\.invite/ })).toBeDisabled();
  });

  it("offers no new custom role when the plan does not include them", async () => {
    fx.entitlements = [];
    renderWithProviders(
      <QueryClientProvider client={client()}>
        <RolesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "New role" })).toBeDisabled();
    expect(
      await screen.findByText(
        "Custom roles are not in this school's plan. Built-in roles can still be viewed.",
      ),
    ).toHaveAttribute("role", "status");
  });
});
