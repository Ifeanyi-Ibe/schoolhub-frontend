import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { parseApiProblem } from "@/lib/api/problem";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { Input } from "./input";
import { Money } from "./money";
import { ResponsiveTable } from "./responsive-table";
import { StatusBadge } from "./status-badge";
import {
  CommandPalette,
  filterPaletteItems,
  isPaletteShortcut,
  type PaletteItem,
} from "./command-palette";

describe("Button", () => {
  it("is a 44px-tall button by default and submits as type=button", () => {
    renderWithProviders(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("min-h-11");
  });

  it("while loading, is disabled, marks itself busy, and keeps the accessible name of the action", () => {
    renderWithProviders(
      <Button loading loadingLabel="Saving">
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Saving" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("Input", () => {
  it("is labelled by its label and points at its hint and error", () => {
    renderWithProviders(
      <Input
        label="Full name"
        hint="As on the admission form"
        error="Enter a full name"
        required
      />,
    );
    const input = screen.getByLabelText(/Full name/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(screen.getByText("Enter a full name")).toHaveAttribute("aria-live", "polite");
  });

  it("is not marked invalid without an error", () => {
    renderWithProviders(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });
});

describe("StatusBadge", () => {
  it("always shows its text, so status is not conveyed by colour alone", () => {
    renderWithProviders(<StatusBadge tone="danger">Failed</StatusBadge>);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("Money", () => {
  it("renders naira with tabular figures", () => {
    renderWithProviders(<Money kobo={123450} />);
    const el = screen.getByText("₦1,234.50");
    expect(el.className).toContain("tabular-nums");
  });
});

describe("EmptyState", () => {
  it("names the next action", () => {
    renderWithProviders(
      <EmptyState title="No invoices yet" action={<Button>Generate invoices</Button>} />,
    );
    expect(screen.getByRole("heading", { name: "No invoices yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate invoices" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("shows the stable code and trace ID, and copies only the safe details", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const problem = parseApiProblem(409, {
      code: "concurrency.conflict",
      traceId: "trace-123",
      detail: "private body",
    });
    renderWithProviders(
      <ErrorState title="Changed by someone else" problem={problem} onRetry={() => undefined} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("concurrency.conflict");
    expect(screen.getByRole("alert")).toHaveTextContent("trace-123");
    await userEvent.click(screen.getByRole("button", { name: "Copy error details" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("trace-123");
    expect(copied).not.toContain("private body");
    await waitFor(() => expect(screen.getByText("Error details copied")).toBeInTheDocument());
  });
});

describe("ResponsiveTable", () => {
  it("labels every cell with its column header so the card layout keeps meaning", () => {
    renderWithProviders(
      <ResponsiveTable
        caption="Students"
        columns={[
          { key: "name", header: "Name", cell: (r: { name: string }) => r.name },
          { key: "bal", header: "Balance", numeric: true, cell: (r: { bal: string }) => r.bal },
        ]}
        rows={[{ id: "1", name: "Ada", bal: "₦0.00" }]}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole("table", { name: "Students" })).toBeInTheDocument();
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveAttribute("data-label", "Name");
    expect(cells[1]).toHaveAttribute("data-label", "Balance");
  });
});

describe("CommandPalette", () => {
  const select = vi.fn();
  const items: PaletteItem[] = [
    { id: "students", label: "Students", group: "Staff", keywords: ["learners"], onSelect: select },
    { id: "fees", label: "Fee invoices", group: "Bursar", onSelect: select },
  ];

  it("filters by label, group and keywords, requiring every word to match", () => {
    expect(filterPaletteItems(items, "learn").map((i) => i.id)).toEqual(["students"]);
    expect(filterPaletteItems(items, "bursar fee").map((i) => i.id)).toEqual(["fees"]);
    expect(filterPaletteItems(items, "fee students")).toEqual([]);
    expect(filterPaletteItems(items, "  ")).toHaveLength(2);
  });

  it("recognises Ctrl-K and Cmd-K only", () => {
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: "K", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k", ctrlKey: false, metaKey: false })).toBe(false);
  });

  it("moves through results with arrow keys and runs the chosen item on Enter", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandPalette items={items} open onOpenChange={onOpenChange} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant") ?? "";
    expect(active).toMatch(/fees$/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(select).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
