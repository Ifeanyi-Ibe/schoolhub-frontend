"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { PERMISSION, holdsAny } from "@/features/staff/rules";
import { ApiError } from "@/lib/api/unwrap";
import {
  brandingQuery,
  policiesQuery,
  schoolProfileQuery,
  type Branding,
  type Policies,
  type SchoolProfile,
} from "./api";

const ProfileDialog = lazy(() =>
  import("./SettingsDialogs").then((m) => ({ default: m.ProfileDialog })),
);
const BrandingDialog = lazy(() =>
  import("./SettingsDialogs").then((m) => ({ default: m.BrandingDialog })),
);
const PoliciesDialog = lazy(() =>
  import("./SettingsDialogs").then((m) => ({ default: m.PoliciesDialog })),
);

type Section = "profile" | "branding" | "policies";

/** School settings. Visible and editable with settings.manage (UX only; the API decides). */
export function SettingsView() {
  const t = useTranslations("settings");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const readOnly = useReadOnly();
  const canManage =
    me.data !== undefined && holdsAny(me.data.permissions, [PERMISSION.settingsManage]);
  const suspended = tenant.data?.suspended === true;
  const writable = canManage && !readOnly && !suspended;
  const profile = useQuery({ ...schoolProfileQuery, enabled: canManage });
  const branding = useQuery({ ...brandingQuery, enabled: canManage });
  const policies = useQuery({ ...policiesQuery, enabled: canManage });
  const [editing, setEditing] = useState<Section | null>(null);

  if (me.data === undefined) {
    if (me.isError)
      return (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          onRetry={() => void qc.invalidateQueries()}
        />
      );
    return <SkeletonList rows={3} label={tState("loading")} />;
  }
  if (!canManage) return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {readOnly || suspended ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <SectionCard
        title={t("profile.title")}
        description={t("profile.intro")}
        state={profile}
        writable={writable}
        onEdit={() => setEditing("profile")}
        editLabel={t("edit")}
        rows={profile.data ? profileRows(profile.data, t) : []}
        loading={tState("loading")}
        errorTitle={tState("errorTitle")}
        errorBody={tState("errorBody")}
      />
      <SectionCard
        title={t("branding.title")}
        description={t("branding.intro")}
        state={branding}
        writable={writable}
        onEdit={() => setEditing("branding")}
        editLabel={t("edit")}
        rows={branding.data ? brandingRows(branding.data, t) : []}
        loading={tState("loading")}
        errorTitle={tState("errorTitle")}
        errorBody={tState("errorBody")}
      />
      <SectionCard
        title={t("policies.title")}
        description={t("policies.intro")}
        state={policies}
        writable={writable}
        onEdit={() => setEditing("policies")}
        editLabel={t("edit")}
        rows={policies.data ? policyRows(policies.data, t) : []}
        loading={tState("loading")}
        errorTitle={tState("errorTitle")}
        errorBody={tState("errorBody")}
      />

      <Suspense fallback={null}>
        {editing === "profile" && profile.data ? (
          <ProfileDialog
            initial={profile.data}
            onOpenChange={(open) => !open && setEditing(null)}
          />
        ) : null}
        {editing === "branding" && branding.data ? (
          <BrandingDialog
            initial={branding.data}
            onOpenChange={(open) => !open && setEditing(null)}
          />
        ) : null}
        {editing === "policies" && policies.data ? (
          <PoliciesDialog
            initial={policies.data}
            onOpenChange={(open) => !open && setEditing(null)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

interface Row {
  label: string;
  value: string;
}

function SectionCard({
  title,
  description,
  state,
  writable,
  onEdit,
  editLabel,
  rows,
  loading,
  errorTitle,
  errorBody,
}: {
  title: string;
  description: string;
  state: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  writable: boolean;
  onEdit: () => void;
  editLabel: string;
  rows: Row[];
  loading: string;
  errorTitle: string;
  errorBody: string;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {writable && !state.isPending && !state.isError ? (
          <Button variant="secondary" onClick={onEdit}>
            {editLabel}
          </Button>
        ) : null}
      </div>
      {state.isPending ? (
        <SkeletonList rows={2} label={loading} />
      ) : state.isError ? (
        <ErrorState
          title={errorTitle}
          description={errorBody}
          problem={state.error instanceof ApiError ? state.error.problem : null}
          onRetry={() => void state.refetch()}
        />
      ) : (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {r.label}
              </dt>
              <dd className="mt-1 truncate text-sm text-foreground">{r.value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

type SettingsT = (key: string, values?: Record<string, string | number>) => string;

function profileRows(p: SchoolProfile, t: SettingsT): Row[] {
  return [
    { label: t("profile.fields.name"), value: p.name },
    { label: t("profile.fields.registrationNo"), value: p.registrationNo },
    { label: t("profile.fields.address"), value: p.address },
    { label: t("profile.fields.email"), value: p.email },
    { label: t("profile.fields.phones"), value: p.phones },
    { label: t("profile.fields.principalName"), value: p.principalName },
  ];
}

function brandingRows(b: Branding, t: SettingsT): Row[] {
  return [
    { label: t("branding.fields.primaryColor"), value: b.primaryColor },
    { label: t("branding.fields.secondaryColor"), value: b.secondaryColor },
    { label: t("branding.fields.logo"), value: b.logo },
    { label: t("branding.fields.reportCardHeader"), value: b.reportCardHeader },
  ];
}

function policyRows(p: Policies, t: SettingsT): Row[] {
  const yesNo = (v: boolean) => (v ? t("yes") : t("no"));
  return [
    { label: t("policies.fields.timezone"), value: p.timezone },
    { label: t("policies.fields.adminNoFormat"), value: p.adminNoFormat },
    { label: t("policies.fields.receiptNoFormat"), value: p.receiptNoFormat },
    { label: t("policies.fields.invoiceNoFormat"), value: p.invoiceNoFormat },
    {
      label: t("policies.fields.requireFeesCleared"),
      value: yesNo(p["results.requireFeesCleared"]),
    },
    {
      label: t("policies.fields.requireMfaForAdmins"),
      value: yesNo(p["security.requireMfaForAdmins"]),
    },
  ];
}
