"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ScanLine, TriangleAlert } from "lucide-react";

import { ReportCamera } from "@/components/report/report-camera";
import { ReportStepHeading } from "@/components/report/report-shell";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import {
  ReportApiError,
  analyzeReportImage,
  patchReport,
  uploadReportImage,
} from "@/lib/report/client";
import type { CivicCategory, VisionResult } from "@/lib/report/schema";
import { CIVIC_CATEGORIES } from "@/lib/report/schema";

const t = getDictionary();

type Phase = "capture" | "analyzing" | "confirm" | "choose-category" | "error";

/*
 * Photo -> vision analysis -> citizen confirmation, all under /report/[id]/camera.
 *
 * The AI's guess is never the final word: "detected" only ever produces a
 * *possible* category, shown with a "Yes / No" choice, exactly mirroring how
 * the CNIC flow never writes an extracted field until the citizen has seen
 * and accepted it.
 */
export function CameraFlow({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("capture");
  const [vision, setVision] = React.useState<VisionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [imageKey, setImageKey] = React.useState(0);

  async function handleCaptured(image: { blob: Blob }) {
    setPhase("analyzing");
    setError(null);

    try {
      await uploadReportImage(reportId, image.blob);
      const result = await analyzeReportImage(reportId);
      setVision(result.vision);

      if (!result.vision.readable) {
        setError(t.report.qualityCheckBody);
        setPhase("capture");
        setImageKey((k) => k + 1);
        return;
      }

      setPhase(result.vision.detected ? "confirm" : "choose-category");
    } catch (cause) {
      if (cause instanceof ReportApiError && cause.reason === "not_configured") {
        // No vision provider available — skip straight to manual category choice.
        setPhase("choose-category");
        return;
      }
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
      setPhase("capture");
      setImageKey((k) => k + 1);
    }
  }

  async function confirmYes() {
    setBusy(true);
    try {
      await patchReport(reportId, { visionConfirmed: true });
      router.push(`/report/${reportId}/describe`);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setBusy(false);
    }
  }

  function confirmNo() {
    setVision(null);
    setError(null);
    setPhase("capture");
    setImageKey((k) => k + 1);
  }

  async function chooseCategory(category: CivicCategory) {
    setBusy(true);
    setError(null);
    try {
      await patchReport(reportId, { category, visionConfirmed: true });
      router.push(`/report/${reportId}/describe`);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "analyzing") {
    return (
      <>
        <ReportStepHeading title={t.report.analyzingTitle} subtitle={t.report.analyzingBody} />
        <div className="rounded-[20px] border border-line bg-surface p-10 text-center" role="status" aria-live="polite">
          <span className="relative mx-auto flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-civic-100 opacity-75" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-civic-100">
              <ScanLine className="size-7 text-civic-700" aria-hidden="true" />
            </span>
          </span>
        </div>
      </>
    );
  }

  if (phase === "confirm" && vision?.category) {
    const categoryLabel = t.report.categories[vision.category];
    return (
      <>
        <ReportStepHeading title={t.report.confirmIssuePrompt} />

        <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-[0.9375rem] font-semibold text-amber-900">
              {t.report.possibleIssue.replace("{category}", categoryLabel.toLowerCase())}
            </p>
            {vision.evidence.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-[0.8125rem] leading-relaxed text-amber-900/70">
                {vision.evidence.map((line) => (
                  <li key={line}>— {line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        <div className="flex flex-col gap-2.5">
          <Button size="full" onClick={confirmYes} loading={busy}>
            {t.report.confirmYes}
          </Button>
          <Button variant="secondary" size="full" onClick={confirmNo} disabled={busy}>
            {t.report.confirmNo}
          </Button>
        </div>
      </>
    );
  }

  if (phase === "choose-category") {
    return (
      <>
        <ReportStepHeading
          title={t.report.chooseCategoryPrompt}
          subtitle={vision && !vision.detected ? t.report.notDetectedBody : t.report.visionUnavailableBody}
        />

        {error ? <ErrorBanner message={error} /> : null}

        <div className="grid grid-cols-2 gap-2.5">
          {CIVIC_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => chooseCategory(category)}
              disabled={busy}
              className="rounded-[16px] border border-line-strong bg-surface p-4 text-start text-[0.875rem] font-semibold text-ink transition-colors hover:border-civic-300 hover:bg-civic-50 disabled:pointer-events-none disabled:opacity-55"
            >
              {t.report.categories[category]}
            </button>
          ))}
        </div>
      </>
    );
  }

  // -- capture --------------------------------------------------------------
  return (
    <>
      <ReportStepHeading title={t.report.cameraTitle} subtitle={t.report.cameraSubtitle} />
      {error ? <div className="mb-5"><ErrorBanner message={error} /></div> : null}
      <ReportCamera key={imageKey} onCaptured={handleCaptured} />
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="text-[0.875rem] text-danger">{message}</p>
    </div>
  );
}
