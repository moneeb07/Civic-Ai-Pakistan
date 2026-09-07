"use client";

import * as React from "react";
import { ImageUp, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { prepareCnicUpload } from "@/lib/image";

const t = getDictionary();

/** Which face of the card an instance is asking for. */
export type CnicSide = "front" | "back";

/*
 * CNIC capture.
 *
 * Pick a photograph, look at it, send it. That is the whole component, and
 * getting here meant deleting a great deal.
 *
 * WHAT WAS HERE BEFORE, AND WHY IT IS NOT.
 * This file used to run a live camera with a per-frame analysis loop: card
 * detection, edge geometry, tilt, glare, sharpness, brightness, a stability
 * streak, an auto-firing shutter, spoken guidance driven by whichever defect
 * currently scored worst, and a second server round-trip that re-judged the
 * captured still before allowing "Use this photo".
 *
 * All of it was measuring the wrong thing. Those heuristics judged PIXELS,
 * and the question that matters is whether a model can read the card — which
 * it very often could on photographs this pipeline rejected. Glare on the
 * laminate, a card held at an angle, a dim room: the model handles all of
 * these, and the gate did not know that, so it stood between the citizen and
 * a working scan and told them their perfectly good photograph was "not
 * readable".
 *
 * So the judgement moved to the two parties actually equipped to make it: the
 * model, which reads the card, and the citizen, who checks the result against
 * the card in their hand on the very next screen, where every field is
 * editable. Nothing here blocks a photograph any more.
 *
 * The camera is gone from this path too. `capture="environment"` on the input
 * below asks a phone for its rear camera — which is what phone users actually
 * wanted from the old scanner — while desktop browsers ignore it and show a
 * file picker. A laptop webcam pointed at a card was never the good route.
 */

interface CnicCaptureProps {
  /** Receives a compressed JPEG ready to upload. */
  onCaptured: (image: { blob: Blob; dataUrl: string }) => void;
  disabled?: boolean;
  /** Overrides the Urdu drop-zone instruction — distinguishes front from back. */
  frameLabel?: string;
  /** The English line under it. Defaults to the side's own wording. */
  frameLabelEn?: string;
  /** Overrides the alt text on the confirmation preview. */
  previewAlt?: string;
  /**
   * Title for the capture panel.
   *
   * Retained from the full-screen scanner this replaces. There is no longer a
   * scanner chrome to title, but the call sites pass it and it still names the
   * side being captured, so it labels the preview instead of being dropped.
   */
  title?: string;
  /** Which side of the card this instance is capturing. */
  side: CnicSide;
}

export function CnicCapture({
  onCaptured,
  disabled,
  frameLabel = t.identity.frameLabel,
  frameLabelEn,
  previewAlt = "The CNIC photo you just took",
  title,
  side,
}: CnicCaptureProps) {
  /*
   * Which face of the card this instance is asking for, said in the button.
   * "Upload CNIC" is ambiguous at the exact moment it matters — the citizen is
   * holding a two-sided card and has to know which face to present.
   */
  const uploadLabel = side === "front" ? t.identity.uploadFront : t.identity.uploadBack;
  const uploadLabelEn =
    side === "front" ? t.identity.uploadFrontEn : t.identity.uploadBackEn;
  const dropLabelEn =
    frameLabelEn ??
    (side === "front" ? t.identity.frameLabelEn : t.identity.frameLabelBackEn);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<{ blob: Blob; dataUrl: string } | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      /*
       * Resized and re-encoded, and that is the only thing done to the image.
       * It is a transport concern — a raw 8MB phone photo is a slow upload on
       * a metered connection — not an opinion about whether the photograph is
       * good enough.
       */
      const prepared = await prepareCnicUpload(file);
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
    } catch {
      setError("We couldn't read that image. Please try another photo.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * `capture="environment"` asks a phone for its rear camera but is ignored by
   * desktop browsers, which show the normal file picker — so one input serves
   * both "take a photo" and "choose from gallery".
   */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      onChange={handleFile}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  // -- Preview: confirm or choose another ------------------------------------
  if (preview) {
    return (
      <div className="rounded-[18px] border border-line bg-surface p-4">
        {fileInput}

        {title ? (
          <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
            {title}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[14px] bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.dataUrl}
            alt={previewAlt}
            className="mx-auto max-h-[46vh] w-full object-contain"
          />
        </div>

        {error ? (
          <p className="mt-3 text-[0.8125rem] text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {/*
          "Use this photo" is never blocked. There is no verdict on the image
          to wait for any more — if the model cannot read it, the citizen finds
          out on the review screen with the fields in front of them and can
          come back, which is a far shorter road than being refused here.
        */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => onCaptured(preview)}
            disabled={disabled || busy}
            className="min-h-12 flex-1"
          >
            {t.identity.usePhoto}
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setPreview(null);
              pickFile();
            }}
            disabled={disabled || busy}
            className="min-h-12 flex-1"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t.identity.retake}
          </Button>
        </div>
      </div>
    );
  }

  // -- Idle: choose a photograph ---------------------------------------------
  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      {fileInput}

      {title ? (
        <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </p>
      ) : null}

      <button
        type="button"
        onClick={pickFile}
        disabled={disabled || busy}
        className="flex min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-civic-200 bg-civic-50/60 px-4 py-6 text-center transition-colors hover:border-civic-500 hover:bg-civic-50 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-7 animate-spin text-civic-700" aria-hidden="true" />
        ) : (
          <ImageUp className="size-7 text-civic-700" aria-hidden="true" />
        )}
        {/*
          Urdu carries the instruction; English restates it. `dir="rtl"` is on
          the Urdu line specifically — the surrounding page is left-to-right,
          and marking the whole container would reverse the icon and the
          English line with it.
        */}
        <span
          dir="rtl"
          lang="ur"
          className="text-[1.0625rem] font-semibold leading-relaxed text-ink"
        >
          {frameLabel}
        </span>
        <span className="text-[0.8125rem] text-muted">{dropLabelEn}</span>
      </button>

      {error ? (
        <p className="mt-3 text-[0.8125rem] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        onClick={pickFile}
        disabled={disabled || busy}
        loading={busy}
        className="mt-4 min-h-12 w-full"
      >
        {!busy ? <ImageUp className="size-4" aria-hidden="true" /> : null}
        <span className="flex flex-col items-center leading-tight">
          <span dir="rtl" lang="ur" className="text-[0.9375rem] font-semibold">
            {uploadLabel}
          </span>
          <span className="text-[0.6875rem] font-medium opacity-80">{uploadLabelEn}</span>
        </span>
      </Button>
    </div>
  );
}

/** The photography guidance shown beside the capture control. */
export function CaptureGuidance() {
  const items = [
    t.identity.guidance.flat,
    t.identity.guidance.light,
    t.identity.guidance.corners,
    t.identity.guidance.glare,
    t.identity.guidance.cover,
  ];

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {t.identity.guidance.heading}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[0.875rem] text-ink/80">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-civic-500"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
