"use client";

import { useQuery } from "@tanstack/react-query";
import { useLightTranslations } from "@/i18n/light-provider";
import React, { lazy, Suspense, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { meQuery } from "@/features/shell/api";

// The two forms use react-hook-form. Each loads when the user opens it with Edit, so the profile page's
// first-load JavaScript does not include the form library until someone needs it.
const ContactCard = lazy(() => import("./ProfileForms").then((m) => ({ default: m.ContactCard })));
const ChangePasswordCard = lazy(() =>
  import("./ProfileForms").then((m) => ({ default: m.ChangePasswordCard })),
);

function FormSkeleton() {
  return <div className="h-40 animate-pulse rounded-control bg-muted" aria-hidden="true" />;
}

/** One editable section: its title and Edit control in the header, the form beneath when it is open. */
function EditSection({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const t = useLightTranslations("profile");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Button
          variant={open ? "ghost" : "secondary"}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={`${t("edit")}: ${label}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("closeEdit") : t("edit")}
        </Button>
      </div>
      {open ? (
        <div id={id} className="border-t border-border/70 pt-5">
          <Suspense fallback={<FormSkeleton />}>{children(() => setOpen(false))}</Suspense>
        </div>
      ) : null}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-background px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function ProfileView() {
  const t = useLightTranslations("profile");
  const me = useQuery(meQuery);
  if (!me.data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <PageHeader title={t("title")} />
        <div className="h-36 animate-pulse rounded-card bg-muted" aria-hidden="true" />
      </div>
    );
  }
  const u = me.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <section className="relative overflow-hidden rounded-card border border-border/80 bg-surface p-6 shadow-card sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-brand-soft to-transparent opacity-80"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={u.displayName} size="lg" className="size-16 text-xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {u.displayName}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={u.mfaEnabled ? "success" : "warning"}>
                {t("twoStep")}: {u.mfaEnabled ? t("on") : t("off")}
              </StatusBadge>
            </div>
          </div>
        </div>
      </section>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Detail label={t("name")} value={u.displayName} />
          <Detail label={t("email")} value={u.email ?? t("notSet")} />
          <Detail label={t("phone")} value={u.phone ?? t("notSet")} />
        </dl>
      </Card>
      <EditSection title={t("contactTitle")} label={t("contactTitle")}>
        {() => <ContactCard />}
      </EditSection>
      <EditSection title={t("changeTitle")} label={t("changeTitle")}>
        {() => <ChangePasswordCard />}
      </EditSection>
    </div>
  );
}
