import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ProfileView } from "./ProfileView";

vi.mock("@/features/shell/api", () => ({
  meQuery: {
    queryKey: ["me-profile-test"],
    queryFn: async () => ({
      displayName: "Test User",
      email: null,
      phone: null,
      mfaEnabled: false,
    }),
  },
}));
vi.mock("./ProfileForms", () => ({
  ContactCard: () => <p>contact form open</p>,
  ChangePasswordCard: () => <p>password form open</p>,
}));

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <QueryClientProvider client={client}>
      <ProfileView />
    </QueryClientProvider>,
  );
}

describe("profile forms open on demand", () => {
  it("shows no form until the user chooses Edit, then shows that form only", async () => {
    const user = userEvent.setup();
    renderProfile();
    const edit = await screen.findByRole("button", { name: "Edit: Change password" });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("password form open")).toBeNull();
    expect(screen.queryByText("contact form open")).toBeNull();

    await user.click(edit);
    expect(await screen.findByText("password form open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit: Change password" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByText("contact form open")).toBeNull();
  });

  it("closes the form again and removes it from the page", async () => {
    const user = userEvent.setup();
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Edit: Verify contact details" }));
    await screen.findByText("contact form open");
    await user.click(screen.getByRole("button", { name: /Edit: Verify contact details/ }));
    await waitFor(() => expect(screen.queryByText("contact form open")).toBeNull());
  });
});
