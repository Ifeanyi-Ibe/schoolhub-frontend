"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sub-navigation for the students area: the list, bulk import and promotions. */
export function StudentsTabs({
  canImport,
  canPromote,
}: {
  canImport: boolean;
  canPromote: boolean;
}) {
  const t = useTranslations("students");
  const pathname = usePathname();
  const tabs = [
    { href: "/students", label: t("tabs.list"), show: true },
    { href: "/students/import", label: t("tabs.import"), show: canImport },
    { href: "/students/promotions", label: t("tabs.promotions"), show: canPromote },
  ].filter((tab) => tab.show);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t("title")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 rounded-card border border-border bg-surface p-1 shadow-card">
        {tabs.map((tab) => {
          const current =
            tab.href === "/students" ? pathname === "/students" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "bg-brand text-on-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
