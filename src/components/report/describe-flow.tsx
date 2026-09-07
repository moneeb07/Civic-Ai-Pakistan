"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Keyboard, RotateCcw } from "lucide-react";

import { ReportStepHeading } from "@/components/report/report-shell";
import { VoiceRecorder } from "@/components/report/voice-recorder";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import {
  ReportApiError,
  submitTextDescription,
  submitVoiceDescription,
} from "@/lib/report/client";


type Mode = "choose" | "voice" | "type" | "review";

/*
 * Voice-or-text description, then a mandatory review step before moving on —
 * the brief is explicit that speech-recognition mistakes must be correctable,
 * so the transcript is never sent onward until the citizen has seen and, if
 * needed, edited it.
 */
export function DescribeFlow({ reportId }: { reportId: string }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("choose");
  const [recorderKey, setRecorderKey] = React.useState(0);
  const [transcript, setTranscript] = React.useState("");
  const [typedText, setTypedText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleRecorded(blob: Blob, mimeType: string) {
    setError(null);
    try {
      const updated = await submitVoiceDescription(reportId, blob, mimeType);
      setTranscript(updated.transcript ?? "");
      setMode("review");
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
      // Force the recorder to remount so its internal state returns to idle.
      setRecorderKey((k) => k + 1);
      setMode("voice");
    }
  }

  async function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    if (!typedText.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitTextDescription(reportId, typedText.trim());
      setTranscript(updated.transcript ?? typedText.trim());
      setMode("review");
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmTranscript() {
    if (!transcript.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // Whatever the citizen has in the box now is authoritative, whether or
      // not they changed it — always re-saved as their own words.
      await submitTextDescription(reportId, transcript.trim());
      router.push(`/report/${reportId}/location`);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "review") {
    return (
      <>
        <ReportStepHeading title={t.report.whatWeHeard} />
        {error ? <ErrorBanner message={error} /> : null}

        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          dir="auto"
          rows={5}
          className="w-full rounded-[16px] border border-line-strong bg-surface p-4 text-[0.9375rem] leading-relaxed text-ink outline-none focus-visible:border-civic-600"
        />

        <div className="mt-5 flex flex-col gap-2.5">
          <Button size="full" onClick={confirmTranscript} loading={submitting} disabled={!transcript.trim()}>
            {t.report.transcriptCorrect}
          </Button>
          <Button
            variant="secondary"
            size="full"
            onClick={() => {
              setTranscript("");
              setRecorderKey((k) => k + 1);
              setMode("choose");
            }}
            disabled={submitting}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t.report.recordAgain}
          </Button>
        </div>
      </>
    );
  }

  if (mode === "voice") {
    return (
      <>
        <ReportStepHeading title={t.report.describeTitle} subtitle={t.report.describeSubtitle} />
        {error ? <ErrorBanner message={error} /> : null}
        <VoiceRecorder key={recorderKey} onRecorded={handleRecorded} />
        <button
          type="button"
          onClick={() => setMode("type")}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-[0.875rem] font-medium text-civic-700 transition-colors hover:border-civic-200 hover:bg-civic-50"
        >
          <Keyboard className="size-4" aria-hidden="true" />
          {t.report.typeInstead}
        </button>
      </>
    );
  }

  if (mode === "type") {
    return (
      <>
        <ReportStepHeading title={t.report.describeTitle} subtitle={t.report.describeSubtitle} />
        {error ? <ErrorBanner message={error} /> : null}

        <form onSubmit={submitTyped} className="space-y-4">
          <textarea
            value={typedText}
            onChange={(event) => setTypedText(event.target.value)}
            dir="auto"
            rows={5}
            placeholder={t.report.describePlaceholder}
            className="w-full rounded-[16px] border border-line-strong bg-surface p-4 text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-muted focus-visible:border-civic-600"
          />
          <Button type="submit" size="full" loading={submitting} disabled={!typedText.trim()}>
            {t.registration.continue}
          </Button>
        </form>
      </>
    );
  }

  // -- choose -----------------------------------------------------------------
  return (
    <>
      <ReportStepHeading title={t.report.describeTitle} subtitle={t.report.describeSubtitle} />
      {error ? <ErrorBanner message={error} /> : null}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMode("voice")}
          className="w-full rounded-[18px] border border-line-strong bg-surface p-5 text-start transition-colors hover:border-civic-300 hover:bg-civic-50"
        >
          <p className="text-[0.9375rem] font-semibold text-ink">🎙️ {t.report.useVoice}</p>
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          className="w-full rounded-[18px] border border-line-strong bg-surface p-5 text-start transition-colors hover:border-civic-300 hover:bg-civic-50"
        >
          <p className="text-[0.9375rem] font-semibold text-ink">⌨️ {t.report.typeInstead}</p>
        </button>
      </div>
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
