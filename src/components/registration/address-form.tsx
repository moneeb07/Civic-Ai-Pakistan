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
import { useT } from "@/components/i18n/locale-provider";
import {
  buildAddressPrefill,
  type AddressFormState,
} from "@/lib/registration/address-prefill";
import type { CnicAddressData } from "@/lib/registration/schema";


/*
 * Both addresses, pre-filled from the card.
 *
 * The Present Address read off the CNIC's back fills the current-address
 * fields; the Permanent Address fills its own separate box. Neither is merged
 * into the other and neither is silently trusted: every field stays editable,
 * the ones that came from the card are badged, and the citizen is asked to
 * check them — a printed Urdu address rarely splits into house/street/sector/
 * district as cleanly as a form does, so this is a starting point to correct,
 * not a fact to accept.
 *
 * Previously these were "tap to use" suggestions over an empty form, which
 * meant a perfectly-read address looked to the citizen like no address had
 * been extracted at all.
 */
export function AddressForm({
  initial,
  cnicPresentAddress,
  cnicPermanentAddress,
}: {
  initial?: Partial<AddressFormState>;
  cnicPresentAddress?: CnicAddressData | null;
  cnicPermanentAddress?: CnicAddressData | null;
}) {
  const t = useT();
  const router = useRouter();
  const { reportStruggle } = useAssistedMode();

  /*
   * Computed once, on mount. The prefill depends only on server-rendered
   * props, and recomputing it would fight the citizen's own edits.
   */
  const [prefill] = React.useState(() =>
    buildAddressPrefill(initial, cnicPresentAddress, cnicPermanentAddress),
  );

  const [values, setValues] = React.useState<AddressFormState>(prefill.values);
  const [source, setSource] = React.useState<"present" | "permanent" | null>(null);
  /** Cleared per field as soon as the citizen edits it — then it is theirs. */
  const [cnicFilled, setCnicFilled] = React.useState(prefill.fromCnic);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const hasCnicAddress = Boolean(cnicPresentAddress ?? cnicPermanentAddress);

  function update<K extends keyof AddressFormState>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));

    // Once the citizen edits a field, that address is theirs, not the card's.
    if (key === "permanentAddress") {
      setCnicFilled((current) => ({ ...current, permanent: false }));
    } else {
      setCnicFilled((current) => ({ ...current, current: false }));
      setSource(null);
    }
  }

  /** Re-applies one of the card's blocks over the current-address fields. */
  function applyFromCnic(which: "present" | "permanent") {
    const data = which === "present" ? cnicPresentAddress : cnicPermanentAddress;
    if (!data) return;

    setValues((current) => ({
      ...current,
      houseNumber: data.houseNumber ?? "",
      city: data.city ?? "",
      district: data.district ?? "",
      sector: data.sector ?? "",
      street: data.streetOrMohalla ?? "",
      // "road" is never split out by the model — the raw text goes into the
      // free-text current address instead, where nothing is lost.
      road: "",
      residentialAddress: data.raw ?? "",
      // The permanent box is deliberately untouched: this control chooses
      // which address the citizen LIVES at, and must never overwrite the
      // separate permanent record (spec §13 — do not merge the two).
    }));
    setSource(which);
    setCnicFilled((current) => ({ ...current, current: true }));
    setErrors({});
  }

  /** For the very common case of never having moved. */
  function copyCurrentToPermanent() {
    setValues((current) => ({
      ...current,
      permanentAddress: current.residentialAddress,
    }));
    setCnicFilled((current) => ({ ...current, permanent: false }));
    setErrors((current) => ({ ...current, permanentAddress: "" }));
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

        {cnicFilled.current || source ? (
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
              /*
               * dir="auto" lets the browser pick direction from the text
               * itself, so an Urdu address renders right-to-left and an
               * English one left-to-right, in the same box. Forcing either
               * direction would mangle one of the two.
               */
              dir="auto"
              autoComplete="street-address"
              placeholder={t.address.residentialPlaceholder}
              value={values.residentialAddress}
              onChange={(event) => update("residentialAddress", event.target.value)}
              invalid={Boolean(errors.residentialAddress)}
            />
          )}
        </FormField>

        {/*
          Permanent address: its own field, never merged with the current one.
          Pre-filled from the CNIC's Permanent Address block when the back was
          read, in the script it was printed in.
        */}
        <div className="space-y-2">
          <FormField
            label={`${t.address.permanentAddress} (${t.address.optional})`}
            error={errors.permanentAddress}
          >
            {(field) => (
              <Input
                {...field}
                dir="auto"
                placeholder={t.address.permanentPlaceholder}
                value={values.permanentAddress}
                onChange={(event) => update("permanentAddress", event.target.value)}
                invalid={Boolean(errors.permanentAddress)}
              />
            )}
          </FormField>

          <div className="flex flex-wrap items-center gap-2">
            {cnicFilled.permanent ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-civic-100 px-2.5 py-1 text-[0.75rem] font-semibold text-civic-700">
                <ScanLine className="size-3" aria-hidden="true" />
                {t.address.fromCnicSource}
              </span>
            ) : null}

            <button
              type="button"
              onClick={copyCurrentToPermanent}
              className="rounded-full border border-line-strong px-3 py-1 text-[0.75rem] font-medium text-civic-700 transition-colors hover:border-civic-200 hover:bg-civic-50"
            >
              {t.address.sameAsCurrent}
            </button>
          </div>
        </div>

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
  const t = useT();
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
