// Navigation registry. Each item names the permission it needs (or, with anyOf, any one of them); an
// item with neither is for every signed-in user. Items appear only for features that exist (no dead
// links). Visibility comes from effective permissions in GET /me, never from role names.

export interface NavItem {
  id: string;
  href: string;
  labelKey: string;
  permission?: string;
  anyOf?: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", href: "/home", labelKey: "shell.nav.home" },
  { id: "profile", href: "/profile", labelKey: "shell.nav.profile" },
  { id: "sessions", href: "/sessions", labelKey: "shell.nav.sessions" },
  {
    id: "people",
    href: "/people",
    labelKey: "shell.nav.people",
    anyOf: ["users.invite", "users.manage"],
  },
  {
    id: "roles",
    href: "/roles",
    labelKey: "shell.nav.roles",
    anyOf: ["roles.assign", "roles.manage"],
  },
  {
    id: "academics",
    href: "/academics/levels",
    labelKey: "shell.nav.academics",
    anyOf: ["academics.read", "academics.manage"],
  },
];

/** The items this user may see, given their effective permissions from GET /me. */
export function visibleNav(items: readonly NavItem[], permissions: readonly string[]): NavItem[] {
  const granted = new Set(permissions);
  return items.filter((item) => {
    if (item.anyOf !== undefined) return item.anyOf.some((p) => granted.has(p));
    return item.permission === undefined || granted.has(item.permission);
  });
}
