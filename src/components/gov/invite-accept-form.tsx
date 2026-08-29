"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { GovField } from "@/components/gov/gov-field";
import { InlineError } from "@/components/gov/states";
import { acceptInvite, GovApiError } from "@/lib/gov/client";
import { acceptInviteSchema } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Sets a password on an invited account.
 *
 * The email is not editable and is not sent: the server reads it from the
 * invite. Letting the browser supply it would mean a valid token could create
 * an account for any address.
 *
 * Validation runs on blur and again on submit — the same rule the citizen
 * forms follow — and each message sits beside its own field.
 */
export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [values, setValues] = React.useState({ name: "", password: "", confirmPassword: "" });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  type Field = keyof typeof values;

  const parsed = acceptInviteSchema.safeParse(values);
  const fieldErrors: Partial<Record<Field, string[]>> = parsed.success
    ? {}
    : parsed.error.flatten().fieldErrors;

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function markTouched(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  /*
   * Zod's own messages are developer-facing ("String must contain at least 8
   * character(s)"); each field supplies the sentence an officer should read
   * instead, shown only once the field has been touched.
   */
  function errorFor(field: Field, message: string): string | null {
    if (!touched[field]) return null;
    return fieldErrors[field]?.[0] ? message : null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ name: true, password: true, confirmPassword: true });
    if (!parsed.success) return;

    setBusy(true);
    setError(null);

    try {
      const result = await acceptInvite(token, parsed.data);
      // The server chose the destination from the invite's role — the browser
      // is told where to go, it does not decide.
      router.push(result.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <InlineError message={error} /> : null}

      <div className="space-y-4">
        <GovField
          id="invite-name"
          label={t.gov.invite.nameLabel}
          autoComplete="name"
          placeholder={t.gov.invite.namePlaceholder}
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          onBlur={() => markTouched("name")}
          error={errorFor("name", "Enter your full name.")}
          disabled={busy}
        />

        <GovField
          id="invite-password"
          label={t.gov.invite.passwordLabel}
          type="password"
          autoComplete="new-password"
          placeholder={t.gov.invite.passwordPlaceholder}
          value={values.password}
          onChange={(event) => set("password", event.target.value)}
          onBlur={() => markTouched("password")}
          error={errorFor("password", "Use at least 8 characters.")}
          disabled={busy}
        />

        <GovField
          id="invite-confirm"
          label={t.gov.invite.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          placeholder={t.gov.invite.confirmPasswordPlaceholder}
          value={values.confirmPassword}
          onChange={(event) => set("confirmPassword", event.target.value)}
          onBlur={() => markTouched("confirmPassword")}
          error={errorFor("confirmPassword", "Both passwords must match.")}
          disabled={busy}
        />
      </div>

      <Button type="submit" size="full" loading={busy} className="mt-6">
        {busy ? t.gov.invite.submitting : t.gov.invite.submit}
      </Button>
    </form>
  );
}
