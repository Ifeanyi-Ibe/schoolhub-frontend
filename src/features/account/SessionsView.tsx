"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLightTranslations } from "@/i18n/light-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      setMessage("That device could not be signed out. Try again.");
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {sessions.data && sessions.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {(sessions.data ?? []).map((s) => (
          <li key={s.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{s.device ?? t("unknownDevice")}</p>
                {s.current ? (
                  <StatusBadge tone="info">{t("current")}</StatusBadge>
                ) : s.active ? (
                  <StatusBadge tone="success">{t("active")}</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">{t("inactive")}</StatusBadge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("lastUsed", { when: formatInstant(s.lastUsedAt) })}
              </p>
              {!s.current && s.active ? (
                <Button
                  variant="secondary"
                  disabled={readOnly}
                  onClick={() => revoke(s.id)}
                  className="self-start"
                >
                  {t("revoke")}
                </Button>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      <Button
        variant="danger"
        disabled={readOnly}
        onClick={signOutEverywhere}
        className="self-start"
      >
        {t("signOutEverywhere")}
      </Button>
    </div>
  );
}
