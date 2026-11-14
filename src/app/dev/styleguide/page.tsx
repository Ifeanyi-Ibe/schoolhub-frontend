// Development-only styleguide: every token and shared component in every state.
// Returns 404 in production (brief: non-production only).
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { StyleguideClient } from "./styleguide-client";
import { Money } from "@/components/ui/money";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Banner } from "@/components/ui/banner";
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { guardBrandColor } from "@/lib/theme/contrast";

export const dynamic = "force-dynamic";

const TOKENS = [
  ["background", "bg-background"],
  ["surface", "bg-surface"],
  ["surface-raised", "bg-surface-raised"],
  ["muted", "bg-muted"],
  ["border", "bg-border"],
  ["brand", "bg-brand"],
  ["danger", "bg-danger"],
  ["success-surface", "bg-success-surface"],
  ["warning-surface", "bg-warning-surface"],
  ["danger-surface", "bg-danger-surface"],
  ["info-surface", "bg-info-surface"],
  ["neutral-surface", "bg-neutral-surface"],
] as const;

export default async function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = await getTranslations("styleguide");
  const sample = guardBrandColor("#c2410c");

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>

      <section aria-labelledby="tokens" className="flex flex-col gap-4">
        <h2 id="tokens" className="font-display text-xl font-semibold">
          {t("tokens")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOKENS.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1">
              <div
                className={`h-12 rounded-control border border-border ${cls}`}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
        <p className="font-display text-2xl font-semibold">Plus Jakarta Sans heading</p>
        <p className="text-base">
          Inter body text, 16px. Numerals:{" "}
          <span className="tabular-nums">0123456789 ₦1,234,500.00</span>
        </p>
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <h2 id="buttons" className="font-display text-xl font-semibold">
          {t("buttons")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading loadingLabel="Saving">
            Loading
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section aria-labelledby="inputs" className="flex flex-col gap-4">
        <h2 id="inputs" className="font-display text-xl font-semibold">
          {t("inputs")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("inputLabel")} hint={t("inputHint")} required />
          <Input label={t("inputLabel")} error={t("inputError")} defaultValue="" />
        </div>
      </section>

      <section aria-labelledby="badges" className="flex flex-col gap-4">
        <h2 id="badges" className="font-display text-xl font-semibold">
          {t("badges")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <StatusBadge tone="success">Paid</StatusBadge>
          <StatusBadge tone="warning">Overdue</StatusBadge>
          <StatusBadge tone="danger">Failed</StatusBadge>
          <StatusBadge tone="info">Submitted</StatusBadge>
          <StatusBadge tone="neutral">Draft</StatusBadge>
        </div>
      </section>

      <section aria-labelledby="money" className="flex flex-col gap-4">
        <h2 id="money" className="font-display text-xl font-semibold">
          {t("money")}
        </h2>
        <Card>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <dt className="text-muted-foreground">Tuition</dt>
            <dd className="text-right">
              <Money kobo={45_000_000} />
            </dd>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="text-right">
              <Money kobo={-1250} />
            </dd>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="cards" className="flex flex-col gap-4">
        <h2 id="cards" className="font-display text-xl font-semibold">
          {t("cards")}
        </h2>
        <Card>
          <CardTitle>Card title</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Card body text.</p>
        </Card>
        <ResponsiveTable
          caption="Sample students"
          columns={[
            { key: "name", header: t("sample.name"), cell: (r: { name: string }) => r.name },
            {
              key: "class",
              header: t("sample.class"),
              cell: (r: { classValue: string }) => r.classValue,
            },
            {
              key: "balance",
              header: t("sample.balance"),
              cell: (r: { kobo: number }) => <Money kobo={r.kobo} />,
            },
            {
              key: "status",
              header: t("sample.status"),
              cell: () => <StatusBadge tone="warning">Overdue</StatusBadge>,
            },
          ]}
          rows={[
            {
              id: "1",
              name: t("sample.student"),
              classValue: t("sample.classValue"),
              kobo: 1250000,
            },
            { id: "2", name: "Chinedu Eze", classValue: "SS 1 Silver", kobo: 0 },
          ]}
          rowKey={(r) => r.id}
        />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <SkeletonList rows={2} />
        </div>
        <EmptyState
          title="No invoices yet"
          description="Invoices appear here once fees are generated for the term."
          action={<Button>Generate invoices</Button>}
        />
      </section>

      <section aria-labelledby="feedback" className="flex flex-col gap-4">
        <h2 id="feedback" className="font-display text-xl font-semibold">
          {t("feedback")}
        </h2>
        <Banner tone="info" title="Update available">
          Refresh to get the latest version.
        </Banner>
        <Banner tone="warning" title="You are offline">
          Changes will wait until you reconnect.
        </Banner>
        <Banner
          tone="danger"
          assertive
          title="Billing suspended"
          action={<Button variant="secondary">View billing</Button>}
        >
          Data is read-only until the account is paid.
        </Banner>
        <p className="text-sm text-muted-foreground">
          Brand guard: {sample.accent} on {sample.onAccent} is {sample.ratio}:1 (
          {sample.adjusted ? "adjusted" : "unchanged"}).
        </p>
      </section>

      <StyleguideClient />
    </main>
  );
}
