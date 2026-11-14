// Navigation registry. Each item names the permission it needs; an item with no permission is
// for every signed-in user. Items appear only for features that exist (no dead links).

export interface NavItem {
  id: string;
  href: string;
  labelKey: string;
  permission?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", href: "/home", labelKey: "shell.nav.home" },
  { id: "profile", href: "/profile", labelKey: "shell.nav.profile" },
  { id: "sessions", href: "/sessions", labelKey: "shell.nav.sessions" },
];

/** The items this user may see, given their effective permissions from GET /me. */
export function visibleNav(items: readonly NavItem[], permissions: readonly string[]): NavItem[] {
  const granted = new Set(permissions);
  return items.filter((item) => item.permission === undefined || granted.has(item.permission));
}
