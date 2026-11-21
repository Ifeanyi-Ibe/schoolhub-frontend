import { describe, expect, it } from "vitest";
import { HomeIcon } from "@/components/ui/icons";
import { NAV_ITEMS, visibleNav, type NavItem } from "./nav";

describe("visibleNav", () => {
  it("shows the signed-in items to everyone, with no permission needed", () => {
    expect(visibleNav(NAV_ITEMS, []).map((i) => i.id)).toEqual(["home", "profile", "sessions"]);
  });

  it("shows a staff item when the user holds any one of its permissions", () => {
    expect(visibleNav(NAV_ITEMS, ["users.manage"]).map((i) => i.id)).toContain("people");
    expect(visibleNav(NAV_ITEMS, ["users.manage"]).map((i) => i.id)).not.toContain("roles");
    expect(visibleNav(NAV_ITEMS, ["roles.assign"]).map((i) => i.id)).toContain("roles");
  });

  it("hides an item until the user holds its permission", () => {
    const items: NavItem[] = [
      ...NAV_ITEMS,
      { id: "fees", href: "/fees", labelKey: "x", icon: HomeIcon, permission: "fees.reports.read" },
    ];
    expect(visibleNav(items, ["me.profile"]).map((i) => i.id)).not.toContain("fees");
    expect(visibleNav(items, ["fees.reports.read"]).map((i) => i.id)).toContain("fees");
  });

  it("only lists pages that exist", () => {
    for (const item of NAV_ITEMS)
      expect([
        "/home",
        "/profile",
        "/sessions",
        "/people",
        "/roles",
        "/academics/levels",
        "/settings",
      ]).toContain(item.href);
  });
});
