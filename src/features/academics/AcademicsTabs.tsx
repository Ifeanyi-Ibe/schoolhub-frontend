"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "levels", href: "/academics/levels" },
  { id: "subjects", href: "/academics/subjects" },
  { id: "grading", href: "/academics/grading" },
  { id: "assessment", href: "/academics/assessment" },
  { id: "calendar", href: "/academics/calendar" },
] as const;

/** Sub-navigation for academic setup. A horizontal, scrollable row on phones; the current page is marked. */
export function AcademicsTabs() {
  const t = useTranslations("academics.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 rounded-card border border-border bg-surface p-1 shadow-card">
        {TABS.map((tab) => {
          const current = pathname.startsWith(tab.href);
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "bg-brand text-on-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {t(tab.id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
