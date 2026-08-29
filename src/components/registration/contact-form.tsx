"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export function ContactForm({
  initialPhone = "",
  initialEmail = "",
}: {
  initialPhone?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const { reportStruggle } = useAssistedMode();

  const [phone, setPhone] = React.useState(initialPhone);
  const [email, setEmail] = React.useState(initialEmail);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch("/api/registration/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "contact", values: { phone, email } }),
      });
      const payload = await response.json();

      if (!payload.success) {
        reportStruggle();
        if (payload.fieldErrors) {
          const flattened: Record<string, string> = {};
          for (const [key, messages] of Object.entries(payload.fieldErrors)) {
            if (Array.isArray(messages) && messages[0]) flattened[key] = String(messages[0]);
          }
          setErrors(flattened);
        }
        if (payload.message) setFormError(payload.message);
        setSubmitting(false);
        return;
      }

      router.push("/register/security");
    } catch {
      setFormError(t.errors.network);
      setSubmitting(false);
    }
  }

  return (
    <>
      <StepHeading title={t.contact.title} subtitle={t.contact.subtitle} />
      <VoiceAssistBar phrase={t.voice.contact} className="mb-5" />

      {/* Sets expectations: nothing here could have come off the card. */}
      <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          {t.contact.notOnCnic}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <FormAlert message={formError} /> : null}

        <FormField
          label={t.contact.phone}
          error={errors.phone}
          hint={t.contact.phoneHint}
        >
          {(field) => (
            <Input
              {...field}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.contact.phonePlaceholder}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              invalid={Boolean(errors.phone)}
            />
          )}
        </FormField>

        <FormField label={t.contact.email} error={errors.email}>
          {(field) => (
            <Input
              {...field}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t.contact.emailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={Boolean(errors.email)}
            />
          )}
        </FormField>

        <Button type="submit" size="full" loading={submitting} className="mt-2">
          {submitting ? t.registration.saving : t.registration.continue}
        </Button>
      </form>
    </>
  );
}
