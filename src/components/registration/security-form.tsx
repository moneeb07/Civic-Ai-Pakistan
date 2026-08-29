"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { usePasswordVault } from "@/components/registration/password-vault";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

const t = getDictionary();

/*
 * The password step.
 *
 * The value stays on this device: it is held in the in-memory vault and sent
 * only to /api/registration/complete. It is never written to the registration
 * session, and the voice assistant is given a fixed instructional phrase that
 * contains no field values — it cannot read, hear or repeat a password.
 */
export function SecurityForm() {
  const router = useRouter();
  const vault = usePasswordVault();
  const { reportStruggle } = useAssistedMode();

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    const next: Record<string, string> = {};

    if (password.length < PASSWORD_MIN_LENGTH) {
      next.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setSubmitting(false);
      reportStruggle();
      return;
    }

    vault.set(password);
    router.push("/register/address");
  }

  return (
    <>
      <StepHeading title={t.security.title} subtitle={t.security.subtitle} />
      <VoiceAssistBar phrase={t.voice.security} className="mb-5" />

      <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-civic-200 bg-civic-50 px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
        <p className="text-[0.8125rem] leading-relaxed text-civic-900/80">
          {t.security.voiceNotice}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <FormField
            label={t.security.password}
            error={errors.password}
            hint={t.security.hint}
          >
            {(field) => (
              <PasswordInput
                {...field}
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: "" }));
                }}
                invalid={Boolean(errors.password)}
              />
            )}
          </FormField>
          <PasswordStrength password={password} />
        </div>

        <FormField label={t.security.confirmPassword} error={errors.confirmPassword}>
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setErrors((current) => ({ ...current, confirmPassword: "" }));
              }}
              invalid={Boolean(errors.confirmPassword)}
            />
          )}
        </FormField>

        <Button type="submit" size="full" loading={submitting} className="mt-2">
          {t.registration.continue}
        </Button>
      </form>
    </>
  );
}
