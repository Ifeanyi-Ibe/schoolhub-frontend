"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const SECTIONS = [
  { id: "reports", href: "/fees" },
  { id: "setup", href: "/fees/setup" },
  { id: "invoices", href: "/fees/invoices" },
  { id: "payments", href: "/fees/payments" },
  { id: "ledger", href: "/fees/ledger" },
] as const;

/** The fees sections, as a tab bar. The current section is marked for screen readers. */
export function FeesTabs() {
  const t = useTranslations("fees.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 rounded-card border border-border bg-surface p-1 shadow-card">
        {SECTIONS.map((s) => {
          const current = s.href === "/fees" ? pathname === "/fees" : pathname.startsWith(s.href);
          return (
            <li key={s.id}>
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "bg-brand text-on-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {t(s.id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
