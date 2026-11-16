"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import React, { lazy, Suspense, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { meQuery } from "@/features/shell/api";

// The two forms use react-hook-form. Each loads when the user opens it with Edit, so the profile page's
// first-load JavaScript does not include the form library until someone needs it.
const ContactCard = lazy(() => import("./ProfileForms").then((m) => ({ default: m.ContactCard })));
const ChangePasswordCard = lazy(() =>
  import("./ProfileForms").then((m) => ({ default: m.ChangePasswordCard })),
);

function FormSkeleton() {
  return <Card className="h-40 animate-pulse bg-muted" aria-hidden="true" />;
}

/** An Edit button that reveals one form. The form is mounted only while it is open. */
function EditSection({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={`${t("edit")}: ${label}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("closeEdit") : t("edit")}
        </Button>
      </div>
      {open ? (
        <div id={id}>
          <Suspense fallback={<FormSkeleton />}>{children(() => setOpen(false))}</Suspense>
        </div>
      ) : null}
    </div>
  );
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
      <EditSection label={t("contactTitle")}>{() => <ContactCard />}</EditSection>
      <EditSection label={t("changeTitle")}>{() => <ChangePasswordCard />}</EditSection>
    </div>
  );
}
