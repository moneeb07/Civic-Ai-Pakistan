"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, MapPinned, ScanLine } from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import type { CnicAddressData } from "@/lib/registration/schema";

const t = getDictionary();

interface AddressState {
  houseNumber: string;
  city: string;
  district: string;
  sector: string;
  street: string;
  road: string;
  residentialAddress: string;
}

const EMPTY: AddressState = {
  houseNumber: "",
  city: "",
  district: "",
  sector: "",
  street: "",
  road: "",
  residentialAddress: "",
};

/*
 * Address is always typed OR CONFIRMED by the citizen — never written silently.
 *
 * If the CNIC's back was scanned and carried a Present or Permanent Address,
 * those are offered as one-tap prefills here (see the CnicAddressPrompt below).
 * Nothing is copied in until the citizen taps one, and every field stays
 * editable afterwards — a printed Urdu address rarely splits into house/
 * street/sector/district as cleanly as a form does, so this is a starting
 * point to correct, not a fact to trust blindly.
 */
export function AddressForm({
  initial,
  cnicPresentAddress,
  cnicPermanentAddress,
}: {
  initial?: Partial<AddressState>;
  cnicPresentAddress?: CnicAddressData | null;
  cnicPermanentAddress?: CnicAddressData | null;
}) {
  const router = useRouter();
  const { reportStruggle } = useAssistedMode();

  const [values, setValues] = React.useState<AddressState>({
    ...EMPTY,
    ...initial,
  });
  const [source, setSource] = React.useState<"present" | "permanent" | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const hasCnicAddress = Boolean(cnicPresentAddress ?? cnicPermanentAddress);

  function update<K extends keyof AddressState>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    // Once the citizen edits anything, this is their address, not the card's.
    setSource(null);
  }

  function applyFromCnic(which: "present" | "permanent") {
    const data = which === "present" ? cnicPresentAddress : cnicPermanentAddress;
    if (!data) return;

    setValues({
      houseNumber: data.houseNumber ?? "",
      city: data.city ?? "",
      district: data.district ?? "",
      sector: data.sector ?? "",
      street: data.streetOrMohalla ?? "",
      // "road" is never split out by the model — the raw text goes into the
      // free-text residential address instead, where nothing is lost.
      road: "",
      residentialAddress: data.raw ?? "",
    });
    setSource(which);
    setErrors({});
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/registration/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "address", values }),
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

      router.push("/register/photo");
    } catch {
      setFormError(t.errors.network);
      setSubmitting(false);
    }
  }

  return (
    <>
      <StepHeading title={t.address.title} subtitle={t.address.subtitle} />
      <VoiceAssistBar phrase={t.voice.address} className="mb-5" />

      {hasCnicAddress ? (
        <CnicAddressPrompt
          present={cnicPresentAddress ?? null}
          permanent={cnicPermanentAddress ?? null}
          activeSource={source}
          onChoose={applyFromCnic}
        />
      ) : (
        <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            {t.address.noticeManual}
          </p>
        </div>
      )}

      {hasCnicAddress ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-relaxed text-muted">{t.address.notice}</p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <FormAlert message={formError} /> : null}

        {source ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-civic-100 px-2.5 py-1 text-[0.75rem] font-semibold text-civic-700">
            <ScanLine className="size-3" aria-hidden="true" />
            {t.address.fromCnicSource}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={`${t.address.houseNumber} (${t.address.optional})`}
            error={errors.houseNumber}
          >
            {(field) => (
              <Input
                {...field}
                dir="auto"
                placeholder={t.address.houseNumberPlaceholder}
                value={values.houseNumber}
                onChange={(event) => update("houseNumber", event.target.value)}
              />
            )}
          </FormField>

          <FormField label={t.address.city} error={errors.city}>
            {(field) => (
              <Input
                {...field}
                dir="auto"
                autoComplete="address-level2"
                placeholder={t.address.cityPlaceholder}
                value={values.city}
                onChange={(event) => update("city", event.target.value)}
                invalid={Boolean(errors.city)}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={`${t.address.district} (${t.address.optional})`}
            error={errors.district}
          >
            {(field) => (
              <Input
                {...field}
                dir="auto"
                placeholder={t.address.districtPlaceholder}
                value={values.district}
                onChange={(event) => update("district", event.target.value)}
              />
            )}
          </FormField>

          <FormField label={`${t.address.sector} (${t.address.optional})`} error={errors.sector}>
            {(field) => (
              <Input
                {...field}
                placeholder={t.address.sectorPlaceholder}
                value={values.sector}
                onChange={(event) => update("sector", event.target.value)}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={`${t.address.street} (${t.address.optional})`} error={errors.street}>
            {(field) => (
              <Input
                {...field}
                dir="auto"
                value={values.street}
                onChange={(event) => update("street", event.target.value)}
              />
            )}
          </FormField>

          <FormField label={`${t.address.road} (${t.address.optional})`} error={errors.road}>
            {(field) => (
              <Input
                {...field}
                dir="auto"
                value={values.road}
                onChange={(event) => update("road", event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField label={t.address.residentialAddress} error={errors.residentialAddress}>
          {(field) => (
            <Input
              {...field}
              dir="auto"
              autoComplete="street-address"
              placeholder={t.address.residentialPlaceholder}
              value={values.residentialAddress}
              onChange={(event) => update("residentialAddress", event.target.value)}
              invalid={Boolean(errors.residentialAddress)}
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

/** One-tap prefill from whichever address block(s) the CNIC's back carried. */
function CnicAddressPrompt({
  present,
  permanent,
  activeSource,
  onChoose,
}: {
  present: CnicAddressData | null;
  permanent: CnicAddressData | null;
  activeSource: "present" | "permanent" | null;
  onChoose: (which: "present" | "permanent") => void;
}) {
  return (
    <div className="mb-5 rounded-[18px] border border-civic-200 bg-civic-50 p-4">
      <div className="flex items-center gap-2">
        <MapPinned className="size-4 text-civic-700" aria-hidden="true" />
        <p className="text-[0.875rem] font-semibold text-civic-900">
          {t.registration.fromCnic}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {present ? (
          <AddressChoiceButton
            label={t.address.usePresent}
            data={present}
            active={activeSource === "present"}
            onClick={() => onChoose("present")}
          />
        ) : null}
        {permanent ? (
          <AddressChoiceButton
            label={t.address.usePermanent}
            data={permanent}
            active={activeSource === "permanent"}
            onClick={() => onChoose("permanent")}
          />
        ) : null}
      </div>
    </div>
  );
}

function AddressChoiceButton({
  label,
  data,
  active,
  onClick,
}: {
  label: string;
  data: CnicAddressData;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-[14px] border-2 border-civic-600 bg-surface p-3 text-start"
          : "w-full rounded-[14px] border border-line-strong bg-surface p-3 text-start transition-colors hover:border-civic-300"
      }
    >
      <span className="text-[0.875rem] font-semibold text-civic-700">{label}</span>
      {data.raw ? (
        // The address as printed — Urdu stays Urdu, and dir="auto" lets the
        // browser lay it out right-to-left from the text's own script.
        <span dir="auto" className="mt-1 block text-[0.875rem] leading-snug text-ink">
          {data.raw}
        </span>
      ) : null}
      {data.roman?.raw ? (
        <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">
          {data.roman.raw}
        </span>
      ) : null}
    </button>
  );
}
