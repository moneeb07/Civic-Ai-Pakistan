"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Info,
  Keyboard,
  MapPinned,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { CaptureGuidance, CnicCapture } from "@/components/registration/cnic-capture";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import { formatCnic, isValidCnicFormat, maskCnic } from "@/lib/cnic";
import type { CnicAddressData } from "@/lib/registration/schema";

const t = getDictionary();

type Phase = "capture-front" | "capture-back" | "processing" | "review" | "manual";

interface IdentityFields {
  fullName: string;
  fatherName: string;
  cnicNumber: string;
  dateOfBirth: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  gender: "" | "Male" | "Female";
  nationality: string;
}

const EMPTY: IdentityFields = {
  fullName: "",
  fatherName: "",
  cnicNumber: "",
  dateOfBirth: "",
  dateOfIssue: "",
  dateOfExpiry: "",
  gender: "",
  nationality: "",
};

/*
 * The identity step, end to end:
 *
 *   front capture -> back capture (or skip) -> Gemini -> validate
 *   -> REVIEW (identity + any address found) -> citizen confirms -> save
 *
 * Nothing extracted is written anywhere until the citizen has seen it and
 * pressed Confirm, and any value they edit replaces the extracted one. The
 * back is optional — a citizen missing it, or whose card predates the
 * two-sided layout, is never blocked; they just fill address in by hand later.
 */
export function IdentityFlow() {
  const router = useRouter();
  const { reportStruggle } = useAssistedMode();

  const [phase, setPhase] = React.useState<Phase>("capture-front");
  const frontBlobRef = React.useRef<Blob | null>(null);

  const [fields, setFields] = React.useState<IdentityFields>(EMPTY);
  const [extracted, setExtracted] = React.useState<string[]>([]);
  const [withheld, setWithheld] = React.useState<string[]>([]);
  const [backScanned, setBackScanned] = React.useState(false);
  const [presentAddress, setPresentAddress] = React.useState<CnicAddressData | null>(
    null,
  );
  const [permanentAddress, setPermanentAddress] =
    React.useState<CnicAddressData | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const voicePhrase =
    phase === "processing"
      ? t.voice.processing
      : phase === "review"
        ? t.voice.review
        : phase === "capture-back"
          ? t.voice.identityBack
          : t.voice.identity;

  function update<K extends keyof IdentityFields>(key: K, value: IdentityFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    // A field the citizen edits is theirs now, not the model's.
    setExtracted((current) => current.filter((name) => name !== key));
  }

  async function runExtraction(front: Blob, back: Blob | null) {
    setPhase("processing");
    setError(null);

    const form = new FormData();
    form.append("front", front, "cnic-front.jpg");
    if (back) form.append("back", back, "cnic-back.jpg");

    try {
      const response = await fetch("/api/cnic/extract", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!payload.success) {
        reportStruggle();
        setError(payload.message ?? t.errors.unexpected);

        /*
         * The accuracy gate rejected the read. Nothing extracted is kept and
         * nothing is shown — the citizen goes back to the camera with the
         * specific reason. Deliberately NOT a partial fill of the form: a
         * form pre-filled from a rejected read is exactly the guessed data
         * the gate exists to keep out.
         */
        if (payload.reason === "low_confidence") {
          frontBlobRef.current = null;
          setFields(EMPTY);
          setExtracted([]);
          setWithheld([]);
          setPresentAddress(null);
          setPermanentAddress(null);
        }

        setPhase(payload.reason === "not_configured" ? "manual" : "capture-front");
        return;
      }

      const data = payload.data;

      setFields({
        fullName: data.fullName ?? "",
        fatherName: data.fatherName ?? "",
        cnicNumber: data.cnicNumber ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        dateOfIssue: data.dateOfIssue ?? "",
        dateOfExpiry: data.dateOfExpiry ?? "",
        gender: data.gender === "Male" || data.gender === "Female" ? data.gender : "",
        nationality: data.nationality ?? "",
      });
      setExtracted(data.extractedFields ?? []);
      setWithheld(data.withheldFields ?? []);
      setBackScanned(Boolean(data.backScanned));
      setPresentAddress(data.presentAddress ?? null);
      setPermanentAddress(data.permanentAddress ?? null);
      setPhase("review");
    } catch {
      reportStruggle();
      setError(t.errors.network);
      setPhase("capture-front");
    }
  }

  function handleFrontCaptured(image: { blob: Blob }) {
    frontBlobRef.current = image.blob;
    setPhase("capture-back");
  }

  function handleBackCaptured(image: { blob: Blob }) {
    if (!frontBlobRef.current) {
      setPhase("capture-front");
      return;
    }
    void runExtraction(frontBlobRef.current, image.blob);
  }

  function skipBack() {
    if (!frontBlobRef.current) {
      setPhase("capture-front");
      return;
    }
    void runExtraction(frontBlobRef.current, null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    // Client-side gate for instant feedback; the server re-validates regardless.
    const localErrors: Record<string, string> = {};
    if (!fields.fullName.trim()) {
      localErrors.fullName = "Please enter the name shown on your CNIC.";
    }
    if (!isValidCnicFormat(fields.cnicNumber)) {
      localErrors.cnicNumber = "Please check the CNIC number.";
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setSubmitting(false);
      reportStruggle();
      return;
    }

    try {
      const response = await fetch("/api/registration/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fields.fullName,
          fatherName: fields.fatherName || undefined,
          cnicNumber: formatCnic(fields.cnicNumber),
          dateOfBirth: fields.dateOfBirth || undefined,
          dateOfIssue: fields.dateOfIssue || undefined,
          dateOfExpiry: fields.dateOfExpiry || undefined,
          gender: fields.gender || undefined,
          nationality: fields.nationality || undefined,
          identitySource: extracted.length > 0 ? "cnic_scan" : "manual",
          extractedFields: extracted,
          presentAddress,
          permanentAddress,
        }),
      });

      const payload = await response.json();

      if (!payload.success) {
        reportStruggle();
        if (payload.fieldErrors) {
          const flattened: Record<string, string> = {};
          for (const [key, messages] of Object.entries(payload.fieldErrors)) {
            if (Array.isArray(messages) && messages[0]) flattened[key] = String(messages[0]);
          }
          setFieldErrors(flattened);
        }
        setError(payload.message ?? t.errors.unexpected);
        setSubmitting(false);
        return;
      }

      router.push("/register/contact");
    } catch {
      setError(t.errors.network);
      setSubmitting(false);
    }
  }

  // -- Processing -----------------------------------------------------------
  if (phase === "processing") {
    return (
      <>
        <StepHeading title={t.identity.processingTitle} subtitle={t.identity.processingBody} />
        <VoiceAssistBar phrase={voicePhrase} className="mb-6" />

        <div
          className="rounded-[20px] border border-line bg-surface p-10 text-center"
          role="status"
          aria-live="polite"
        >
          <span className="relative mx-auto flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-civic-100 opacity-75" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-civic-100">
              <ScanLine className="size-7 text-civic-700" aria-hidden="true" />
            </span>
          </span>
          <p className="mt-5 text-[0.9375rem] font-semibold text-ink">
            {t.identity.processingTitle}
          </p>
          <p className="mt-1.5 text-[0.875rem] text-muted">{t.identity.processingBody}</p>
        </div>
      </>
    );
  }

  // -- Review / manual entry ------------------------------------------------
  if (phase === "review" || phase === "manual") {
    const isReview = phase === "review";
    const hasAnyAddress = Boolean(presentAddress ?? permanentAddress);

    return (
      <>
        <StepHeading
          title={isReview ? t.extraction.title : t.identityManual.title}
          subtitle={isReview ? t.extraction.subtitle : t.identityManual.subtitle}
        />
        <VoiceAssistBar phrase={voicePhrase} className="mb-5" />

        {error ? <FormAlert message={error} /> : null}

        {isReview ? (
          <div className="mb-5 space-y-3">
            {/*
              Everything on this screen has already passed the accuracy gate —
              anything the model was unsure of never got this far. The wording
              stays "read", not "verified": CivicAI can confirm it read the
              card, never that the card is genuine.
            */}
            <div className="flex items-start gap-2.5 rounded-[18px] border border-civic-200 bg-civic-50 px-4 py-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
              <div>
                <p className="text-[0.875rem] font-semibold text-civic-900">
                  🟢 {t.extraction.gatePassed}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-civic-900/70">
                  {t.extraction.notVerified}
                </p>
              </div>
            </div>

            {/*
              The only confidence warning that can still appear here. A read
              that was weak OVERALL never reaches this screen — the gate sends
              it back to the camera — so what is left to say is the narrower
              thing: individual fields were held back and are blank on purpose.
            */}
            {withheld.length > 0 ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                <p className="text-[0.8125rem] leading-relaxed text-amber-900">
                  {t.extraction.withheldFields}
                </p>
              </div>
            ) : null}

            {backScanned ? (
              <div className="flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
                <MapPinned className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  {hasAnyAddress
                    ? t.extraction.presentAddressFound
                    : t.extraction.addressNotFound}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              {t.identity.notConfiguredBody}
            </p>
          </div>
        )}

        <div className="space-y-5">
          <ExtractedField
            label={t.identityManual.fullName}
            value={fields.fullName}
            onChange={(value) => update("fullName", value)}
            error={fieldErrors.fullName}
            fromCnic={extracted.includes("fullName")}
            autoComplete="name"
          />

          <ExtractedField
            label={t.identityManual.fatherName}
            value={fields.fatherName}
            onChange={(value) => update("fatherName", value)}
            fromCnic={extracted.includes("fatherName")}
            optional
          />

          <ExtractedField
            label={t.identityManual.cnicNumber}
            value={fields.cnicNumber}
            onChange={(value) => update("cnicNumber", value)}
            error={fieldErrors.cnicNumber}
            fromCnic={extracted.includes("cnicNumber")}
            placeholder={t.identityManual.cnicPlaceholder}
            inputMode="numeric"
            hint={
              isValidCnicFormat(fields.cnicNumber)
                ? `Will be shown as ${maskCnic(fields.cnicNumber)}`
                : undefined
            }
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <ExtractedField
              label={t.identityManual.dateOfBirth}
              value={fields.dateOfBirth}
              onChange={(value) => update("dateOfBirth", value)}
              fromCnic={extracted.includes("dateOfBirth")}
              placeholder={t.identityManual.datePlaceholder}
              optional
            />
            <GenderField
              value={fields.gender}
              onChange={(value) => update("gender", value)}
              fromCnic={extracted.includes("gender")}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <ExtractedField
              label={t.identityManual.dateOfIssue}
              value={fields.dateOfIssue}
              onChange={(value) => update("dateOfIssue", value)}
              fromCnic={extracted.includes("dateOfIssue")}
              placeholder={t.identityManual.datePlaceholder}
              optional
            />
            <ExtractedField
              label={t.identityManual.dateOfExpiry}
              value={fields.dateOfExpiry}
              onChange={(value) => update("dateOfExpiry", value)}
              fromCnic={extracted.includes("dateOfExpiry")}
              placeholder={t.identityManual.datePlaceholder}
              optional
            />
          </div>

          {presentAddress ? (
            <AddressBoxEditor
              title={t.extraction.presentAddressTitle}
              data={presentAddress}
              onChange={setPresentAddress}
            />
          ) : null}

          {permanentAddress ? (
            <AddressBoxEditor
              title={t.extraction.permanentAddressTitle}
              data={permanentAddress}
              onChange={setPermanentAddress}
            />
          ) : null}
        </div>

        <div className="mt-7 flex flex-col gap-2.5">
          <Button size="full" onClick={submit} loading={submitting}>
            {submitting ? t.registration.saving : t.extraction.confirm}
          </Button>

          <Button
            variant="ghost"
            size="full"
            onClick={() => {
              frontBlobRef.current = null;
              setError(null);
              setWithheld([]);
              setPresentAddress(null);
              setPermanentAddress(null);
              setPhase("capture-front");
            }}
            disabled={submitting}
          >
            {t.extraction.retake}
          </Button>
        </div>
      </>
    );
  }

  // -- Capture: back of the card ---------------------------------------------
  if (phase === "capture-back") {
    return (
      <>
        <StepHeading title={t.identity.backTitle} subtitle={t.identity.backSubtitle} />
        <VoiceAssistBar phrase={voicePhrase} className="mb-5" />

        <div className="mb-5 flex items-center gap-2 rounded-full bg-civic-50 px-3 py-1.5 text-[0.8125rem] font-medium text-civic-700 w-fit">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {t.identity.frontCaptured}
        </div>

        <div className="space-y-4">
          <CnicCapture
            key="back"
            onCaptured={handleBackCaptured}
            disabled={submitting}
            frameLabel={t.identity.frameLabelBack}
            previewAlt="The back of your CNIC"
          />
          <CaptureGuidance />

          <button
            type="button"
            onClick={skipBack}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-[0.875rem] font-medium text-civic-700 transition-colors hover:border-civic-200 hover:bg-civic-50"
          >
            {t.identity.skipBack}
          </button>
        </div>
      </>
    );
  }

  // -- Capture: front of the card --------------------------------------------
  return (
    <>
      <StepHeading title={t.identity.title} subtitle={t.identity.subtitle} />
      <VoiceAssistBar phrase={voicePhrase} className="mb-5" />

      {error ? <div className="mb-5"><FormAlert message={error} /></div> : null}

      <div className="space-y-4">
        <CnicCapture key="front" onCaptured={handleFrontCaptured} disabled={submitting} />
        <CaptureGuidance />

        <button
          type="button"
          onClick={() => {
            setPhase("manual");
            setExtracted([]);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-[0.875rem] font-medium text-civic-700 transition-colors hover:border-civic-200 hover:bg-civic-50"
        >
          <Keyboard className="size-4" aria-hidden="true" />
          {t.identity.manual}
        </button>
      </div>
    </>
  );
}

/*
 * One address block (present or permanent) as separate, editable boxes —
 * House No, Street/Mohalla, Sector, District, City — rather than a single raw
 * line.
 *
 * The boxes hold the address in the script it was printed in: a card printed
 * in Urdu shows Urdu, unchanged. Each box carries the Roman-Urdu
 * transliteration underneath it as a reading aid — a phonetic mirror, never a
 * translation, and never a substitute for what the card actually says.
 *
 * Any box the model couldn't read confidently is simply blank, ready for the
 * citizen to complete rather than guessed at.
 */
function AddressBoxEditor({
  title,
  data,
  onChange,
}: {
  title: string;
  data: CnicAddressData;
  onChange: (next: CnicAddressData) => void;
}) {
  function set(key: keyof CnicAddressData, value: string) {
    onChange({ ...data, [key]: value.length > 0 ? value : null });
  }

  const roman = data.roman ?? null;

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <MapPinned className="size-4 text-civic-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-civic-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-civic-700">
          <ScanLine className="size-3" aria-hidden="true" />
          {t.registration.fromCnic}
        </span>
      </div>

      {data.raw ? (
        // dir="auto" so an Urdu line lays out right-to-left and an English
        // one doesn't — the browser decides from the text's own script.
        <p dir="auto" className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
          {data.raw}
        </p>
      ) : null}

      {roman?.raw ? (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          <span className="font-medium">{t.extraction.addressRomanLabel}:</span>{" "}
          {roman.raw}
        </p>
      ) : null}

      <p className="mt-1.5 text-[0.6875rem] text-muted">{t.extraction.addressAsPrinted}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <AddressBox
          label={t.address.houseNumber}
          value={data.houseNumber ?? ""}
          roman={roman?.houseNumber ?? null}
          onChange={(value) => set("houseNumber", value)}
        />
        <AddressBox
          label={t.address.street}
          value={data.streetOrMohalla ?? ""}
          roman={roman?.streetOrMohalla ?? null}
          onChange={(value) => set("streetOrMohalla", value)}
        />
        <AddressBox
          label={t.address.sector}
          value={data.sector ?? ""}
          roman={roman?.sector ?? null}
          onChange={(value) => set("sector", value)}
        />
        <AddressBox
          label={t.address.district}
          value={data.district ?? ""}
          roman={roman?.district ?? null}
          onChange={(value) => set("district", value)}
        />
        <AddressBox
          label={t.address.city}
          value={data.city ?? ""}
          roman={roman?.city ?? null}
          onChange={(value) => set("city", value)}
          className="col-span-2"
        />
      </div>
    </div>
  );
}

function AddressBox({
  label,
  value,
  roman,
  onChange,
  className,
}: {
  label: string;
  value: string;
  roman?: string | null;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[0.75rem] font-medium text-muted">{label}</span>
      <Input
        dir="auto"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 text-[0.875rem]"
      />
      {roman ? (
        <span className="mt-1 block text-[0.6875rem] leading-snug text-muted">{roman}</span>
      ) : null}
    </label>
  );
}

/** A field that shows where its value came from. */
function ExtractedField({
  label,
  value,
  onChange,
  error,
  hint,
  fromCnic,
  optional,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  fromCnic?: boolean;
  optional?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {fromCnic ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-civic-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-civic-700">
            <ScanLine className="size-3" aria-hidden="true" />
            {t.registration.fromCnic}
          </span>
        ) : null}
        {optional && !fromCnic ? (
          <span className="text-[0.6875rem] font-medium text-muted">
            {t.identityManual.optional}
          </span>
        ) : null}
      </div>

      <FormField label="" error={error} hint={hint} className="[&>label]:sr-only">
        {(field) => (
          <Input
            {...field}
            {...inputProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            invalid={Boolean(error)}
          />
        )}
      </FormField>
    </div>
  );
}

function GenderField({
  value,
  onChange,
  fromCnic,
}: {
  value: "" | "Male" | "Female";
  onChange: (value: "" | "Male" | "Female") => void;
  fromCnic?: boolean;
}) {
  const options: { value: "Male" | "Female"; label: string }[] = [
    { value: "Male", label: t.identityManual.male },
    { value: "Female", label: t.identityManual.female },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{t.identityManual.gender}</span>
        {fromCnic ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-civic-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-civic-700">
            <ScanLine className="size-3" aria-hidden="true" />
            {t.registration.fromCnic}
          </span>
        ) : null}
      </div>

      <div role="radiogroup" aria-label={t.identityManual.gender} className="flex gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? "" : option.value)}
              className={
                selected
                  ? "min-h-12 flex-1 rounded-[var(--radius-field)] border-2 border-civic-600 bg-civic-50 text-[0.9375rem] font-semibold text-civic-700"
                  : "min-h-12 flex-1 rounded-[var(--radius-field)] border border-line-strong bg-surface text-[0.9375rem] text-ink transition-colors hover:border-civic-200"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
