"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { GovField } from "@/components/gov/gov-field";
import { InlineError } from "@/components/gov/states";
import { authClient } from "@/lib/auth-client";
import { govLoginSchema } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Government sign-in.
 *
 * Reuses Better Auth's email/password sign-in — the same credential store the
 * citizen side uses — and then lets the server decide where to land, because
 * only the server knows whether this user has an officer record and what role
 * it carries. A user with no officer row is signed straight back out by
 * /gov/login's server component; the client never has to be trusted with that.
 *
 * No sign-up link and no working password reset: government accounts exist by
 * invitation, and there is no transactional email provider configured to send
 * a reset with.
 */
export function GovLoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState<{ email?: boolean; password?: boolean }>({});
  const [error, setError] = React.useState<string | null>(initialError ?? null);
  const [busy, setBusy] = React.useState(false);

  const parsed = govLoginSchema.safeParse({ email, password });
  const fieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (!parsed.success) return;

    setBusy(true);
    setError(null);

    const result = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (result.error) {
      // One message for both "no such account" and "wrong password" — telling
      // them apart would confirm which official addresses exist.
      setError(t.gov.login.invalid);
      setBusy(false);
      return;
    }

    /*
     * Land on /gov and let the server route by role. Doing it here would mean
     * the browser deciding which dashboard an officer sees, which is a
     * decision only the officer record can make.
     */
    router.push("/gov");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <InlineError message={error} /> : null}

      <div className="space-y-4">
        <GovField
          id="gov-email"
          label={t.gov.login.emailLabel}
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder={t.gov.login.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          error={touched.email && fieldErrors.email ? t.gov.login.invalid : null}
          disabled={busy}
        />

        <GovField
          id="gov-password"
          label={t.gov.login.passwordLabel}
          type="password"
          autoComplete="current-password"
          placeholder={t.gov.login.passwordPlaceholder}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          error={touched.password && fieldErrors.password ? t.gov.common.required : null}
          disabled={busy}
        />
      </div>

      <Button type="submit" size="full" loading={busy} className="mt-6">
        {busy ? t.gov.login.submitting : t.gov.login.submit}
      </Button>

      {/*
        Disabled rather than hidden, with the reason attached: an officer who
        forgot their password needs to know the route exists and runs through
        their administrator, not that the feature is missing.
      */}
      <div className="mt-4 text-center">
        <button
          type="button"
          disabled
          title={t.gov.login.forgotPasswordHint}
          className="cursor-not-allowed text-[0.875rem] font-medium text-muted opacity-70"
        >
          {t.gov.login.forgotPassword} — {t.gov.login.forgotPasswordHint}
        </button>
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-muted">{t.gov.login.noSignUp}</p>
    </form>
  );
}
