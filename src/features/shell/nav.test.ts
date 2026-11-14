import { describe, expect, it } from "vitest";
import { NAV_ITEMS, visibleNav, type NavItem } from "./nav";

describe("visibleNav", () => {
  it("shows the signed-in items to everyone, with no permission needed", () => {
    expect(visibleNav(NAV_ITEMS, []).map((i) => i.id)).toEqual(["home", "profile", "sessions"]);
  });

  it("hides an item until the user holds its permission", () => {
    const items: NavItem[] = [
      ...NAV_ITEMS,
      { id: "fees", href: "/fees", labelKey: "x", permission: "fees.reports.read" },
    ];
    expect(visibleNav(items, ["me.profile"]).map((i) => i.id)).not.toContain("fees");
    expect(visibleNav(items, ["fees.reports.read"]).map((i) => i.id)).toContain("fees");
  });

  it("only lists pages that exist in F1", () => {
    for (const item of NAV_ITEMS) expect(["/home", "/profile", "/sessions"]).toContain(item.href);
  });
});
