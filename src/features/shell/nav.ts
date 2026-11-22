import type { IconComponent } from "@/components/ui/icons";
import {
  AcademicIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  GradeIcon,
  DevicesIcon,
  HomeIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/ui/icons";

// Navigation registry. Each item names the permission it needs (or, with anyOf, any one of them); an
// item with neither is for every signed-in user. Items appear only for features that exist (no dead
// links). Visibility comes from effective permissions in GET /me, never from role names.

export interface NavItem {
  id: string;
  href: string;
  labelKey: string;
  icon: IconComponent;
  permission?: string;
  anyOf?: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", icon: HomeIcon, href: "/home", labelKey: "shell.nav.home" },
  { id: "profile", icon: UserIcon, href: "/profile", labelKey: "shell.nav.profile" },
  { id: "sessions", icon: DevicesIcon, href: "/sessions", labelKey: "shell.nav.sessions" },
  {
    id: "students",
    href: "/students",
    labelKey: "shell.nav.students",
    icon: BookIcon,
    anyOf: ["students.read"],
  },
  {
    id: "attendance",
    href: "/attendance",
    labelKey: "shell.nav.attendance",
    icon: CalendarIcon,
    anyOf: ["attendance.mark"],
  },
  {
    id: "fees",
    href: "/fees",
    labelKey: "shell.nav.fees",
    icon: GradeIcon,
    anyOf: ["fees.reports.read", "fees.structures.manage"],
  },
  {
    id: "staff",
    href: "/staff",
    labelKey: "shell.nav.staff",
    icon: BriefcaseIcon,
    anyOf: ["staff.read"],
  },
  {
    id: "my-classes",
    href: "/my-classes",
    labelKey: "shell.nav.my-classes",
    icon: AcademicIcon,
    anyOf: ["me.profile"],
  },
  {
    id: "people",
    icon: PeopleIcon,
    href: "/people",
    labelKey: "shell.nav.people",
    anyOf: ["users.invite", "users.manage"],
  },
  {
    id: "roles",
    icon: ShieldIcon,
    href: "/roles",
    labelKey: "shell.nav.roles",
    anyOf: ["roles.assign", "roles.manage"],
  },
  {
    id: "academics",
    icon: AcademicIcon,
    href: "/academics/levels",
    labelKey: "shell.nav.academics",
    anyOf: ["academics.read", "academics.manage"],
  },
  {
    id: "settings",
    href: "/settings",
    labelKey: "shell.nav.settings",
    icon: SettingsIcon,
    permission: "settings.manage",
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
