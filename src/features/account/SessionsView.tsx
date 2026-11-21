"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLightTranslations } from "@/i18n/light-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DevicesIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sessionsQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { signOut } from "@/features/shell/sign-out";
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { formatInstant } from "@/lib/format/dates";

export function SessionsView() {
  const t = useLightTranslations("sessions");
  const readOnly = useReadOnly();
  const router = useRouter();
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery);
  const [message, setMessage] = useState<string | null>(null);

  async function revoke(id: string) {
    setMessage(null);
    try {
      unwrap(await apiClient.DELETE("/api/v1/me/sessions/{id}", { params: { path: { id } } }));
      setMessage(t("revoked"));
      await qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch {
      setMessage(t("revokeFailed"));
    }
  }

  async function signOutEverywhere() {
    try {
      unwrap(await apiClient.POST("/api/v1/auth/logout-all"));
    } catch {
      // Ending the local session below still applies to this device.
    }
    await signOut({ queryClient: qc }).catch(() => undefined);
    router.replace("/login?signedOut=1");
  }

  const list = sessions.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          <Button variant="danger" disabled={readOnly} onClick={signOutEverywhere}>
            {t("signOutEverywhere")}
          </Button>
        }
      />
      {message ? (
        <p
          role="status"
          className="rounded-control bg-info-surface px-4 py-3 text-sm text-info-foreground"
        >
          {message}
        </p>
      ) : null}
      {sessions.data && list.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {list.map((s) => (
          <li key={s.id}>
            <Card className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-soft-foreground">
                  <DevicesIcon className="size-5" />
                </span>
                {s.current ? (
                  <StatusBadge tone="info">{t("current")}</StatusBadge>
                ) : s.active ? (
                  <StatusBadge tone="success">{t("active")}</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">{t("inactive")}</StatusBadge>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-semibold text-foreground">
                  {s.device ?? t("unknownDevice")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("lastUsed", { when: formatInstant(s.lastUsedAt) })}
                </p>
              </div>
              {!s.current && s.active ? (
                <div className="flex border-t border-border/70 pt-4">
                  <Button variant="secondary" disabled={readOnly} onClick={() => revoke(s.id)}>
                    {t("revoke")}
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
