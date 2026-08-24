"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import type { Dict, Locale } from "@/lib/i18n";

type Step = "email" | "code";

export function LoginForm({
  locale,
  dict,
  next,
}: {
  locale: Locale;
  dict: Dict;
  next: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpId, setOtpId] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/email-code?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.code === "rate_limited"
            ? dict.auth.tooMany
            : data.code === "auth.email_send_failed"
              ? dict.auth.sendFailed
              : dict.auth.invalidEmail,
        );
        return;
      }
      setOtpId(data.otpId);
      setDevCode(data.devCode ?? null);
      setStep("code");
    } catch {
      setError(dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/email-verify?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpId, code }),
      });
      if (!res.ok) {
        setError(dict.auth.invalidCode);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-12 w-full rounded-[var(--r-md)] border border-border-strong bg-surface px-4 text-fg " +
    "placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--primary-ring)]";

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="mt-8 grid gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          {dict.auth.email}
        </label>
        <div className="relative">
          <EnvelopeSimpleIcon
            size={18}
            className="pointer-events-none absolute inset-y-0 start-4 my-auto h-fit text-fg-subtle"
            aria-hidden
          />
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.om"
            className={`${field} ps-11 text-start`}
            aria-describedby="email-help"
            aria-invalid={Boolean(error)}
          />
        </div>
        <p id="email-help" className="text-xs text-fg-subtle">
          {dict.auth.emailHelp}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy}>
          {busy ? dict.common.loading : dict.auth.sendCode}
          <ArrowRightIcon size={17} weight="bold" className="flip-rtl" aria-hidden />
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="mt-8 grid gap-2">
      <h2 className="text-lg font-semibold">{dict.auth.codeTitle}</h2>
      <p className="text-sm text-fg-muted">
        {dict.auth.codeSub} <span className="ltr-island font-medium">{email}</span>
      </p>

      {devCode ? (
        <p className="mt-2 rounded-[var(--r-md)] border border-border bg-warning-soft px-3 py-2 text-sm text-warning">
          {dict.auth.devCode}: <span className="tnum font-semibold">{devCode}</span>
        </p>
      ) : null}

      <label htmlFor="code" className="mt-3 text-sm font-medium">
        {dict.auth.code}
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        autoFocus
        required
        dir="ltr"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        className={`${field} tnum text-center text-xl tracking-[0.4em]`}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-fg-subtle">{dict.auth.checkInbox}</p>
      )}

      <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy || code.length < 6}>
        {busy ? dict.common.loading : dict.auth.verify}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
      >
        {dict.auth.changeEmail}
      </Button>
    </form>
  );
}
