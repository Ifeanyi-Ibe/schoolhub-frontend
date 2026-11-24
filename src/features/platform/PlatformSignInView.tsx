"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { platformMfa, platformPassword, type SignInAnswer } from "./api";

type Stage = "password" | "mfa" | "enrol";

/** Platform staff sign-in: the password, then the MFA code. Nothing is signed in until the server accepts the code (ADR 0027). */
export function PlatformSignInView() {
  const t = useTranslations("platform.signIn");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function apply(answer: SignInAnswer) {
    if (answer.ok) {
      if (answer.step === "mfa") {
        setStage("mfa");
        setMessage(null);
        return;
      }
      if (answer.step === "enrol") {
        setStage("enrol");
        setMessage(null);
        return;
      }
      router.replace("/platform/tenants");
      return;
    }
    setMessage(
      answer.retryAfterSeconds !== undefined
        ? t("rateLimited", { seconds: String(answer.retryAfterSeconds) })
        : t("failed"),
    );
  }

  async function submitPassword() {
    setBusy(true);
    setMessage(null);
    apply(await platformPassword(identifier.trim(), password));
    setPassword("");
    setBusy(false);
  }

  async function submitCode() {
    setBusy(true);
    setMessage(null);
    apply(await platformMfa(code.trim()));
    setCode("");
    setBusy(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <Card className="flex flex-col gap-4">
        {stage === "password" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
          >
            <Input
              label={t("identifier")}
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Input
              label={t("password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={busy || identifier.trim() === "" || password === ""}
                loading={busy}
                loadingLabel={t("working")}
              >
                {t("continue")}
              </Button>
            </div>
          </form>
        ) : null}
        {stage === "mfa" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <Input
              label={t("code")}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={busy || !/^\d{6}$/.test(code.trim())}
                loading={busy}
                loadingLabel={t("working")}
              >
                {t("signIn")}
              </Button>
            </div>
          </form>
        ) : null}
        {stage === "enrol" ? (
          <p className="text-sm text-foreground">{t("enrolNotAvailable")}</p>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
