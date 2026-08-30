"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, ShieldCheck, UserRound } from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { usePasswordVault } from "@/components/registration/password-vault";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export interface ConfirmSummary {
  fullName: string;
  fatherName: string | null;
  cnicMasked: string;
  dateOfBirth: string | null;
  gender: string | null;
  identitySource: string;
  phoneMasked: string;
  emailMasked: string;
  city: string | null;
  houseNumber: string | null;
  district: string | null;
  sector: string | null;
  residentialAddress: string | null;
  permanentAddress: string | null;
  hasProfileImage: boolean;
  profileImage: string | null;
}

/*
 * The last screen before an account exists.
 *
 * Everything sensitive is shown masked — the citizen already checked the full
 * values on the step that collected them, and this page may well be read over
 * someone's shoulder. Each section links back to the step that owns it.
 */
export function ConfirmStep({ summary }: { summary: ConfirmSummary }) {
  const router = useRouter();
  const vault = usePasswordVault();
  const { enabled: assisted } = useAssistedMode();

  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // A hard refresh clears the in-memory vault. Rather than persist a password
  // to survive reloads, send the citizen back to re-enter it.
  const passwordMissing = !vault.isSet;

  async function createAccount() {
    const password = vault.read();

    if (!password) {
      router.push("/register/security");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/registration/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? t.errors.unexpected);
        setSubmitting(false);
        return;
      }

      // The password has done its job; drop it before leaving the flow.
      vault.clear();
      router.push("/register/complete");
      router.refresh();
    } catch {
      setError(t.errors.network);
      setSubmitting(false);
    }
  }

  return (
    <>
      <StepHeading title={t.confirm.title} subtitle={t.confirm.subtitle} />
      <VoiceAssistBar phrase={t.voice.confirm} className="mb-5" />

      {error ? <div className="mb-5"><FormAlert message={error} /></div> : null}

      <div className="space-y-3">
        <SummarySection
          title={t.confirm.identity}
          editHref="/register/identity"
          rows={[
            { label: t.profile.fullName, value: summary.fullName },
            { label: t.profile.fatherName, value: summary.fatherName },
            { label: t.profile.cnic, value: summary.cnicMasked, mono: true },
            { label: t.profile.dateOfBirth, value: summary.dateOfBirth },
            { label: t.profile.gender, value: summary.gender },
          ]}
          footer={
            summary.identitySource === "cnic_scan"
              ? t.profile.extractedFromCnic
              : t.profile.enteredManually
          }
        />

        <SummarySection
          title={t.confirm.contact}
          editHref="/register/contact"
          rows={[
            { label: t.profile.phone, value: summary.phoneMasked, mono: true },
            { label: t.profile.email, value: summary.emailMasked, mono: true },
          ]}
        />

        <SummarySection
          title={t.confirm.address}
          editHref="/register/address"
          rows={[
            { label: t.profile.city, value: summary.city },
            { label: t.address.houseNumber, value: summary.houseNumber },
            { label: t.address.district, value: summary.district },
            { label: t.address.sector, value: summary.sector },
            { label: t.profile.address, value: summary.residentialAddress },
            { label: t.address.permanentAddress, value: summary.permanentAddress },
          ]}
        />

        <SummarySection
          title={t.confirm.security}
          editHref="/register/security"
          rows={[
            {
              label: t.security.password,
              value: passwordMissing ? null : "••••••••••",
              mono: true,
            },
          ]}
          warning={
            passwordMissing
              ? "Please set your password again before creating your account."
              : undefined
          }
        />

        {/* Profile photo */}
        <section className="rounded-[18px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {t.confirm.profile}
            </p>
            <Link
              href="/register/photo"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-civic-700 transition-colors hover:bg-civic-50"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {t.confirm.edit}
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="size-14 overflow-hidden rounded-full border border-line bg-civic-50">
              {summary.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={summary.profileImage}
                  alt="Your profile photo"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center">
                  <UserRound className="size-7 text-civic-500" aria-hidden="true" />
                </span>
              )}
            </span>
            <p className="text-[0.9375rem] text-ink">
              {summary.hasProfileImage ? t.confirm.photoAdded : t.confirm.noPhoto}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-[18px] border border-civic-200 bg-civic-50 px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
        <p className="text-[0.8125rem] leading-relaxed text-civic-900/80">
          {t.confirm.legal}
        </p>
      </div>

      {/* In Assisted Mode the spoken question is mirrored on screen, and the
          answer is always an explicit tap — the assistant never submits. */}
      {assisted ? (
        <p className="mt-5 text-center text-[0.9375rem] font-medium text-ink">
          {t.confirm.assistedPrompt}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5">
        <Button size="full" onClick={createAccount} loading={submitting}>
          {!submitting ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
          {submitting
            ? t.confirm.creating
            : assisted
              ? t.confirm.yesCreate
              : t.confirm.create}
        </Button>

        {assisted ? (
          <Button asChild variant="secondary" size="full">
            <Link href="/register/identity">{t.confirm.reviewAgain}</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}

function SummarySection({
  title,
  editHref,
  rows,
  footer,
  warning,
}: {
  title: string;
  editHref: string;
  rows: { label: string; value: string | null; mono?: boolean }[];
  footer?: string;
  warning?: string;
}) {
  const visible = rows.filter((row) => row.value);

  return (
    <section className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </p>
        <Link
          href={editHref}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-civic-700 transition-colors hover:bg-civic-50"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {t.confirm.edit}
        </Link>
      </div>

      <dl className="mt-3 space-y-2.5">
        {visible.map((row) => (
          <div key={row.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-[0.8125rem] text-muted">{row.label}</dt>
            <dd
              className={
                row.mono
                  ? "font-mono text-[0.875rem] font-medium text-ink"
                  : "text-[0.875rem] font-medium text-ink"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {warning ? (
        <p role="alert" className="mt-3 text-[0.8125rem] font-medium text-danger">
          {warning}
        </p>
      ) : null}

      {footer ? (
        <p className="mt-3 inline-block rounded-full bg-canvas px-2.5 py-1 text-[0.6875rem] font-medium text-muted">
          {footer}
        </p>
      ) : null}
    </section>
  );
}
