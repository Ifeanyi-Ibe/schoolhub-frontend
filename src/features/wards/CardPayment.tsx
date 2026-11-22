"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { useLightTranslations } from "@/i18n/light-provider";
import { nairaToKobo } from "@/features/fees/rules";
import { newActionKey } from "@/lib/api/idempotency";
import { startOnlinePayment } from "./payments";

/**
 * The card payment form for one ward. It loads when the parent opens it (ADR 0021), so the wards screen does not load the
 * payment code until it is needed. The gateway confirms the payment; this form only starts it.
 */
export function CardPayment({ studentId, email }: { studentId: string; email: string }) {
  const t = useLightTranslations("wards");
  const online = useOnline();
  const [amount, setAmount] = useState("");
  const [amountTried, setAmountTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(() => newActionKey());
  const kobo = nairaToKobo(amount);

  async function pay() {
    setAmountTried(true);
    if (kobo === null || email === "") return;
    setBusy(true);
    setMessage(null);
    try {
      const started = await startOnlinePayment({ studentId, amountKobo: kobo, email }, key);
      setKey(newActionKey());
      const url = new URL(started.authorizationUrl);
      // Only the gateway's secure page (https; http on a local test server) is opened from here.
      if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new Error("unsafe gateway address");
      setMessage(t("starting"));
      window.location.assign(url.toString());
    } catch {
      setMessage(t("loadError"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {email === "" ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {t("needEmail")}
        </p>
      ) : null}
      <Input
        label={t("amount")}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={amountTried && kobo === null ? t("amountError") : undefined}
      />
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          onClick={pay}
          disabled={!online || busy || email === ""}
          loading={busy}
          loadingLabel={t("starting")}
        >
          {t("startAction")}
        </Button>
      </div>
    </div>
  );
}
