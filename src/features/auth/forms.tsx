"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useForm, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RetryCountdown } from "@/components/ui/retry-countdown";
import { postAuth } from "./http";
import { afterSignIn, loginFailure, nextStep, type LoginMessage } from "./outcomes";
import { fieldRules, PATTERNS, passwordRules, requiredText } from "./rules";

/** Inline failure text. Announced politely; it never names a field or an account. */
function Notice({ tone, children }: { tone: "error" | "info"; children: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-control border border-danger/40 bg-danger-surface px-3 py-2 text-sm text-danger-foreground"
          : "rounded-control border border-info-foreground/30 bg-info-surface px-3 py-2 text-sm text-info-foreground"
      }
    >
      {children}
    </p>
  );
}

/** Keeps a rate-limit wait on the form: the submit button stays disabled until it ends. */
function useRetryWindow() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const clear = useCallback(() => setSeconds(null), []);
  return { seconds, start: setSeconds, clear };
}

type Translate = ReturnType<typeof useTranslations>;

function loginMessageText(t: Translate, m: LoginMessage, seconds?: number | null): string {
  if (m === "rate") return t("rate", { seconds: seconds ?? 60 });
  return t(m);
}

// ---- Sign in with email or phone and password ----

/** `signedOut` is set when the user was sent here after signing out or changing their password. */
export function LoginForm({ next, signedOut = false }: { next: string; signedOut?: boolean }) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const form = useForm<{ identifier: string; password: string }>({
    defaultValues: { identifier: "", password: "" },
  });
  const [message, setMessage] = useState<LoginMessage | null>(null);
  const retry = useRetryWindow();
  const busy = form.formState.isSubmitting;

  async function onSubmit(values: { identifier: string; password: string }) {
    setMessage(null);
    const call = await postAuth("login", values);
    if (call.ok) {
      const step = nextStep(call.body);
      const query = `?next=${encodeURIComponent(afterSignIn(next))}`;
      if (step === "signed_in") router.replace(afterSignIn(next));
      else if (step === "mfa_required") router.replace(`/login/mfa${query}`);
      else if (step === "enrollment_required") router.replace(`/login/enroll${query}`);
      else setMessage("generic");
      return;
    }
    const m = loginFailure(call);
    setMessage(m);
    if (m === "rate") retry.start(call.retryAfter ?? 60);
    form.setValue("password", "");
  }

  const locked = busy || retry.seconds !== null;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      aria-labelledby="login-title"
    >
      {signedOut ? <Notice tone="info">{t("signedOut")}</Notice> : null}
      <Input
        label={t("identifier")}
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        required
        error={form.formState.errors.identifier ? t("requiredIdentifier") : undefined}
        {...form.register("identifier", requiredText(t("requiredIdentifier")))}
      />
      <Input
        label={t("password")}
        type="password"
        autoComplete="current-password"
        required
        error={form.formState.errors.password ? t("requiredPassword") : undefined}
        {...form.register("password", requiredText(t("requiredPassword")))}
      />
      {message ? <Notice tone="error">{loginMessageText(t, message, retry.seconds)}</Notice> : null}
      {retry.seconds !== null ? (
        <RetryCountdown seconds={retry.seconds} onDone={retry.clear} />
      ) : null}
      <Button
        type="submit"
        loading={busy}
        loadingLabel={t("submit")}
        disabled={locked}
        className="w-full"
      >
        {t("submit")}
      </Button>
      <div className="flex flex-col items-center gap-2 text-sm">
        <Link
          href="/forgot-password"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          {t("forgot")}
        </Link>
        <Link
          href={`/login/otp?next=${encodeURIComponent(afterSignIn(next))}`}
          className="text-foreground underline underline-offset-4"
        >
          {t("otpLink")}
        </Link>
      </div>
    </form>
  );
}

// ---- Phone code sign-in (two steps) ----

export function OtpForm({ next }: { next: string }) {
  const t = useTranslations("auth.otp");
  const tl = useTranslations("auth.login");
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const retry = useRetryWindow();
  const phoneForm = useForm<{ phone: string }>({ defaultValues: { phone: "" } });
  const codeForm = useForm<{ code: string }>({ defaultValues: { code: "" } });

  async function requestCode(values: { phone: string }) {
    setMessage(null);
    const call = await postAuth("otp/request", values);
    if (!call.ok) {
      if (call.status === 429) retry.start(call.retryAfter ?? 60);
      setMessage(
        call.status === 429 ? tl("rate", { seconds: call.retryAfter ?? 60 }) : tl("unavailable"),
      );
      return;
    }
    setPhone(values.phone);
    setMessage(t("sent"));
  }

  async function verify(values: { code: string }) {
    setMessage(null);
    const call = await postAuth("otp/verify", { phone, code: values.code });
    if (call.ok) {
      const step = nextStep(call.body);
      const query = `?next=${encodeURIComponent(afterSignIn(next))}`;
      if (step === "signed_in") router.replace(afterSignIn(next));
      else if (step === "mfa_required") router.replace(`/login/mfa${query}`);
      else if (step === "enrollment_required") router.replace(`/login/enroll${query}`);
      else setMessage(tl("generic"));
      return;
    }
    const m = loginFailure(call);
    setMessage(m === "invalid" ? t("invalidCode") : tl(m === "rate" ? "generic" : m));
    if (m === "rate") retry.start(call.retryAfter ?? 60);
    codeForm.setValue("code", "");
  }

  if (phone === null) {
    return (
      <form
        noValidate
        onSubmit={phoneForm.handleSubmit(requestCode)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("phone")}
          type="tel"
          autoComplete="tel"
          required
          error={phoneForm.formState.errors.phone ? t("invalidPhone") : undefined}
          {...phoneForm.register("phone", fieldRules(t("invalidPhone"), PATTERNS.phone))}
        />
        {message ? <Notice tone="error">{message}</Notice> : null}
        {retry.seconds !== null ? (
          <RetryCountdown seconds={retry.seconds} onDone={retry.clear} />
        ) : null}
        <Button
          type="submit"
          loading={phoneForm.formState.isSubmitting}
          loadingLabel={t("sendCode")}
          disabled={retry.seconds !== null}
          className="w-full"
        >
          {t("sendCode")}
        </Button>
        <Link
          href={`/login?next=${encodeURIComponent(afterSignIn(next))}`}
          className="text-center text-sm underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </form>
    );
  }
  return (
    <form noValidate onSubmit={codeForm.handleSubmit(verify)} className="flex flex-col gap-4">
      <Notice tone="info">{message ?? t("sent")}</Notice>
      <Input
        label={t("code")}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        error={codeForm.formState.errors.code ? t("invalidCode") : undefined}
        {...codeForm.register("code", fieldRules(t("invalidCode"), PATTERNS.otp))}
      />
      {retry.seconds !== null ? (
        <RetryCountdown seconds={retry.seconds} onDone={retry.clear} />
      ) : null}
      <Button
        type="submit"
        loading={codeForm.formState.isSubmitting}
        loadingLabel={t("verify")}
        disabled={retry.seconds !== null}
        className="w-full"
      >
        {t("verify")}
      </Button>
      <button
        type="button"
        onClick={() => requestCode({ phone })}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {t("resend")}
      </button>
    </form>
  );
}

// ---- Second step: authenticator code (or recovery code) ----

export function MfaForm({ next }: { next: string }) {
  const t = useTranslations("auth.mfa");
  const tl = useTranslations("auth.login");
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const retry = useRetryWindow();
  const form = useForm<{ code: string }>({ defaultValues: { code: "" } });

  async function onSubmit(values: { code: string }) {
    setMessage(null);
    const call = await postAuth("mfa/verify", values);
    if (call.ok) {
      router.replace(afterSignIn(next));
      return;
    }
    if (call.status === 401 && call.code === "bff.challenge_missing") {
      router.replace(`/login?next=${encodeURIComponent(afterSignIn(next))}`);
      return;
    }
    const m = loginFailure(call);
    setMessage(m === "invalid" ? t("invalid") : tl(m));
    if (m === "rate") retry.start(call.retryAfter ?? 60);
    form.setValue("code", "");
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <Input
        label={t("code")}
        inputMode="text"
        autoComplete="one-time-code"
        autoCapitalize="none"
        required
        error={form.formState.errors.code ? t("invalid") : undefined}
        {...form.register("code", fieldRules(t("invalid"), PATTERNS.code))}
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      {retry.seconds !== null ? (
        <RetryCountdown seconds={retry.seconds} onDone={retry.clear} />
      ) : null}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        loadingLabel={t("submit")}
        disabled={retry.seconds !== null}
        className="w-full"
      >
        {t("submit")}
      </Button>
      <Link href="/login" className="text-center text-sm underline underline-offset-4">
        {t("back")}
      </Link>
    </form>
  );
}

// ---- Mandatory enrolment: set up the authenticator, confirm, show recovery codes once ----

interface EnrollSetup {
  secret: string;
  otpAuthUri: string;
}

export function EnrollForm({ next }: { next: string }) {
  const t = useTranslations("auth.enroll");
  const tl = useTranslations("auth.login");
  const router = useRouter();
  const [setup, setSetup] = useState<EnrollSetup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const form = useForm<{ code: string }>({ defaultValues: { code: "" } });

  useEffect(() => {
    let live = true;
    postAuth("mfa/enrollment", {}).then((call) => {
      if (!live) return;
      if (
        call.ok &&
        typeof call.body.secret === "string" &&
        typeof call.body.otpAuthUri === "string"
      ) {
        setSetup({ secret: call.body.secret, otpAuthUri: call.body.otpAuthUri });
      } else {
        setMessage(t("expired"));
      }
      setStarting(false);
    });
    return () => {
      live = false;
    };
  }, [t]);

  async function onSubmit(values: { code: string }) {
    setMessage(null);
    const call = await postAuth("mfa/enrollment/confirm", values);
    if (call.ok) {
      const codes = Array.isArray(call.body.recoveryCodes)
        ? (call.body.recoveryCodes as string[])
        : [];
      setRecovery(codes);
      return;
    }
    setMessage(
      call.status === 401
        ? t("expired")
        : tl(loginFailure(call) === "invalid" ? "generic" : loginFailure(call)),
    );
    form.setValue("code", "");
  }

  if (recovery) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">{t("recoveryTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("recoveryBody")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
          {recovery.map((c) => (
            <li key={c} className="rounded-control border border-border bg-surface px-3 py-2">
              {c}
            </li>
          ))}
        </ul>
        <Button onClick={() => router.replace(afterSignIn(next))} className="w-full">
          {t("continue")}
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      {starting ? (
        <p className="text-sm text-muted-foreground" role="status">
          {tl("submit")}…
        </p>
      ) : null}
      {setup ? (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">{t("secret")}</p>
          <p className="break-all font-mono tabular-nums">{setup.secret}</p>
          <a href={setup.otpAuthUri} className="font-semibold underline underline-offset-4">
            {t("openApp")}
          </a>
        </div>
      ) : null}
      <Input
        label={t("code")}
        inputMode="text"
        autoComplete="one-time-code"
        autoCapitalize="none"
        required
        disabled={!setup}
        error={form.formState.errors.code ? t("invalid") : undefined}
        {...form.register("code", fieldRules(t("invalid"), PATTERNS.code))}
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        loadingLabel={t("submit")}
        disabled={!setup}
        className="w-full"
      >
        {t("submit")}
      </Button>
    </form>
  );
}

// ---- Forgot password (always the same answer) ----

export function ForgotForm() {
  const t = useTranslations("auth.forgot");
  const tl = useTranslations("auth.login");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const retry = useRetryWindow();
  const form = useForm<{ identifier: string }>({ defaultValues: { identifier: "" } });

  async function onSubmit(values: { identifier: string }) {
    setMessage(null);
    const call = await postAuth("password/forgot", values);
    if (call.ok) {
      setSent(true);
      return;
    }
    if (call.status === 429) {
      retry.start(call.retryAfter ?? 60);
      setMessage(tl("rate", { seconds: call.retryAfter ?? 60 }));
      return;
    }
    setMessage(tl("unavailable"));
  }

  if (sent) return <Notice tone="info">{t("sent")}</Notice>;
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <Input
        label={t("identifier")}
        autoComplete="username"
        autoCapitalize="none"
        required
        error={form.formState.errors.identifier ? tl("requiredIdentifier") : undefined}
        {...form.register("identifier", requiredText(tl("requiredIdentifier")))}
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      {retry.seconds !== null ? (
        <RetryCountdown seconds={retry.seconds} onDone={retry.clear} />
      ) : null}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        loadingLabel={t("submit")}
        disabled={retry.seconds !== null}
        className="w-full"
      >
        {t("submit")}
      </Button>
      <Link href="/login" className="text-center text-sm underline underline-offset-4">
        {t("back")}
      </Link>
    </form>
  );
}

// ---- Reset and invitation: the one-time token lives in the URL fragment, which is never sent to the server ----

// Read once per page load and cached, so removing the fragment below does not lose the token.
let fragmentToken: string | undefined;
function readFragmentToken(): string {
  if (fragmentToken === undefined) {
    const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
    fragmentToken = m ? decodeURIComponent(m[1] ?? "") : "";
  }
  return fragmentToken;
}
const noSubscribe = () => () => undefined;

/** The one-time token from the URL fragment, or "" when absent. Null during server render. */
function useFragmentToken(): string | null {
  const token = useSyncExternalStore(noSubscribe, readFragmentToken, () => null);
  useEffect(() => {
    // Remove the token from the address bar and history once it is read.
    if (token && window.location.hash)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [token]);
  return token;
}

function SecretForm<T extends FieldValues>({
  form,
  onSubmit,
  children,
}: {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => Promise<void>;
  children: React.ReactNode;
}) {
  const submit = (e: FormEvent) => void form.handleSubmit(onSubmit)(e);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {children}
    </form>
  );
}

export function ResetForm() {
  const t = useTranslations("auth.reset");
  const tl = useTranslations("auth.login");
  const token = useFragmentToken();
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<{ password: string }>({ defaultValues: { password: "" } });

  if (token === null) return null;
  if (token === "") return <Notice tone="error">{t("missingToken")}</Notice>;
  if (done) return <Notice tone="info">{t("done")}</Notice>;

  async function onSubmit(values: { password: string }) {
    setMessage(null);
    const call = await postAuth("password/reset", { token, password: values.password });
    if (call.ok) return setDone(true);
    setMessage(call.status === 429 ? tl("rate", { seconds: call.retryAfter ?? 60 }) : t("invalid"));
  }

  return (
    <SecretForm form={form} onSubmit={onSubmit}>
      <Input
        label={t("password")}
        type="password"
        autoComplete="new-password"
        hint={t("hint")}
        required
        error={form.formState.errors.password ? t("tooShort") : undefined}
        {...form.register(
          "password",
          passwordRules({ required: t("tooShort"), tooShort: t("tooShort") }),
        )}
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        loadingLabel={t("submit")}
        className="w-full"
      >
        {t("submit")}
      </Button>
    </SecretForm>
  );
}

export function InviteForm() {
  const t = useTranslations("auth.invite");
  const token = useFragmentToken();
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<{ password: string }>({ defaultValues: { password: "" } });

  if (token === null) return null;
  if (token === "") return <Notice tone="error">{t("missingToken")}</Notice>;
  if (done) return <Notice tone="info">{t("done")}</Notice>;

  async function onSubmit(values: { password: string }) {
    setMessage(null);
    const call = await postAuth("invites/accept", { token, password: values.password });
    if (call.ok) return setDone(true);
    setMessage(t("invalid"));
  }

  return (
    <SecretForm form={form} onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <Input
        label={t("password")}
        type="password"
        autoComplete="new-password"
        required
        error={form.formState.errors.password ? t("invalid") : undefined}
        {...form.register(
          "password",
          passwordRules({ required: t("invalid"), tooShort: t("invalid") }),
        )}
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        loadingLabel={t("submit")}
        className="w-full"
      >
        {t("submit")}
      </Button>
    </SecretForm>
  );
}
