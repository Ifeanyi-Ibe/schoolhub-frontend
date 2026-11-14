"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense } from "react";
import { Card } from "@/components/ui/card";
import { meQuery } from "@/features/shell/api";

// The two forms use react-hook-form. They load after the account summary, so the profile route's
// first-load JavaScript does not include the form library (scripts/budgets.json, parent group).
const ContactCard = lazy(() => import("./ProfileForms").then((m) => ({ default: m.ContactCard })));
const ChangePasswordCard = lazy(() =>
  import("./ProfileForms").then((m) => ({ default: m.ChangePasswordCard })),
);

function FormSkeleton() {
  return <Card className="h-40 animate-pulse bg-muted" aria-hidden="true" />;
}

export function ProfileView() {
  const t = useTranslations("profile");
  const me = useQuery(meQuery);
  if (!me.data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <Card className="h-24 animate-pulse bg-muted" aria-hidden="true" />
      </div>
    );
  }
  const u = me.data;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("name")}</dt>
          <dd>{u.displayName}</dd>
          <dt className="text-muted-foreground">{t("email")}</dt>
          <dd>{u.email ?? t("notSet")}</dd>
          <dt className="text-muted-foreground">{t("phone")}</dt>
          <dd>{u.phone ?? t("notSet")}</dd>
          <dt className="text-muted-foreground">{t("twoStep")}</dt>
          <dd>{u.mfaEnabled ? t("on") : t("off")}</dd>
        </dl>
      </Card>
      <Suspense fallback={<FormSkeleton />}>
        <ContactCard />
      </Suspense>
      <Suspense fallback={<FormSkeleton />}>
        <ChangePasswordCard />
      </Suspense>
    </div>
  );
}
