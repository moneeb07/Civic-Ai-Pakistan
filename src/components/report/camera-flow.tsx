"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ScanLine, TriangleAlert, Volume2, VolumeX } from "lucide-react";

import { useSpeech } from "@/components/assisted/use-voice-guidance";
import { ReportCamera } from "@/components/report/report-camera";
import { ReportStepHeading } from "@/components/report/report-shell";
import { VoiceRecorder } from "@/components/report/voice-recorder";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import {
  ReportApiError,
  analyzeReportImage,
  patchReport,
  submitVoiceDescription,
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
/*
 * Playing the Urdu prompt aloud, by whatever means actually works here.
 *
 * Two mechanisms, in order, because neither is sufficient alone:
 *
 *   1. AUDIO FROM THE SERVER. The provider generates real Urdu speech and the
 *      browser plays an mp3. Works identically on every device, because the
 *      voice belongs to the app rather than to whatever the user installed.
 *
 *   2. THE BROWSER'S OWN SYNTHESIS. Used only when the server has no voice to
 *      offer — Gemini and OpenRouter have none. Needs no key and no network,
 *      but can only speak languages the device has installed.
 *
 * The order is deliberate and was arrived at the hard way. Browser synthesis
 * was tried first and failed in the one way that is worse than an error: on a
 * desktop with no Urdu voice it reports that it is speaking, fires no error,
 * and plays silence. Nothing in the API distinguishes that from success, so
 * there is no way to detect it and fall forward. Asking the server first
 * inverts the problem — a 204 is an explicit "I cannot", and only then is the
 * unreliable path tried.
 */
interface Narration {
  speaking: boolean;
  loading: boolean;
  play: (text: string) => Promise<void>;
  stop: () => void;
}

function useNarration(reportId: string, speech: ReturnType<typeof useSpeech>): Narration {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);

  const [speaking, setSpeaking] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const { speak: browserSpeak, stop: browserStop } = speech;

  const release = React.useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      // Blob URLs are held by the document until revoked; a citizen who
      // retakes several photos would otherwise leak one recording per attempt.
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = React.useCallback(() => {
    release();
    browserStop();
    setSpeaking(false);
  }, [release, browserStop]);

  const play = React.useCallback(
    async (text: string) => {
      stop();
      setLoading(true);

      try {
        const response = await fetch(`/api/reports/${reportId}/narration`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (response.status === 204) {
          // No voice on this provider — let the device try.
          setLoading(false);
          browserSpeak(text);
          setSpeaking(true);
          return;
        }

        if (!response.ok) throw new Error(`narration failed: ${response.status}`);

        const url = URL.createObjectURL(await response.blob());
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => setSpeaking(false);

        setLoading(false);
        setSpeaking(true);
        await audio.play();
      } catch {
        /*
         * Falling back rather than surfacing an error. The narration is an
         * aid, not the step: a citizen who can read the Urdu on screen is not
         * blocked by silence, and an error banner about audio would only push
         * the actual question further down the page.
         */
        setLoading(false);
        browserSpeak(text);
        setSpeaking(true);
      }
    },
    /*
     * `speaking` and `loading` are deliberately NOT dependencies.
     *
     * They were, and that caused the sentence to repeat forever: playback
     * ends, `speaking` flips to false, `play` gets a new identity, the effect
     * that calls it re-runs, and it plays again — which ends, and so on. A
     * callback that changes identity every time its own effects land cannot be
     * used as an effect dependency. Playing is now a pure action over its
     * arguments, and "have we already narrated this?" is answered by the
     * caller, which is the only place that knows whether a citizen asked.
     */
    [reportId, stop, browserSpeak],
  );

  // Never leave audio playing after the citizen moves on.
  React.useEffect(() => stop, [stop]);

  return { speaking, loading, play, stop };
}

export function CameraFlow({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("capture");
  const [vision, setVision] = React.useState<VisionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [imageKey, setImageKey] = React.useState(0);

  const speech = useSpeech();
  const narration = useNarration(reportId, speech);

  /*
   * The whole finding as one Urdu utterance: what the AI thinks it sees, then
   * the question, then what each button does. Spoken as a single phrase rather
   * than three, because speechSynthesis queues utterances and a citizen who
   * taps a button midway would otherwise keep hearing instructions for a
   * screen they have already left.
   */
  const summaryUr = vision?.summaryUr ?? null;

  const spokenPrompt = React.useMemo(() => {
    if (!summaryUr) return null;
    return [
      summaryUr,
      t.report.confirmSpokenQuestion,
      t.report.confirmSpokenYes,
      t.report.confirmSpokenNo,
    ].join(" ");
  }, [summaryUr]);

  /* Records the citizen's own words, then hands off to the describe step. */
  async function handleVoiceCorrection(blob: Blob, mimeType: string) {
    narration.stop();
    setBusy(true);
    setError(null);
    try {
      /*
       * Saved as the report's transcript, which is precisely what the describe
       * step already reads and shows for editing. So speaking here does not
       * open a parallel path through the flow — it fills in the next screen
       * and lets the citizen correct it there, exactly as if they had recorded
       * it a moment later.
       */
      await submitVoiceDescription(reportId, blob, mimeType);
      await patchReport(reportId, { visionConfirmed: true });
      router.push(`/report/${reportId}/describe`);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
      setBusy(false);
    }
  }

  const { play: playNarration } = narration;

  /*
   * Read aloud once per finding, then never again unless asked.
   *
   * The ref is what makes "once" true: it survives re-renders, so arriving at
   * the confirm step speaks, and everything that happens afterwards — the
   * audio ending, a button gaining focus, any re-render at all — does not.
   * Replaying is the citizen's decision, through the "دوبارہ سنیں" button.
   *
   * Keyed by the text rather than a boolean so that retaking a photo, which
   * produces a genuinely different finding, is narrated as the new thing it is.
   */
  const narratedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (phase !== "confirm" || !spokenPrompt) return;
    if (narratedRef.current === spokenPrompt) return;

    narratedRef.current = spokenPrompt;
    void playNarration(spokenPrompt);
  }, [phase, spokenPrompt, playNarration]);

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
    narration.stop();
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
    narration.stop();
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

        {/*
          The same finding again, in Urdu, and read aloud.

          It sits BELOW the English evidence rather than replacing it: the two
          say the same thing to two different readers, and dropping either
          would leave one of them guessing. Rendered right-to-left with a real
          `lang` so a screen reader hands it to an Urdu voice rather than
          spelling Urdu letters out in English.
        */}
        {spokenPrompt ? (
          <div
            dir="rtl"
            lang="ur"
            className="mb-5 rounded-[18px] border border-civic-200 bg-civic-50 px-4 py-3.5"
          >
            <p className="text-[1.0625rem] leading-[1.9] text-civic-900">{summaryUr}</p>
            <p className="mt-1.5 text-[0.9375rem] leading-[1.9] text-civic-900/75">
              {t.report.confirmSpokenQuestion}
            </p>

            <button
              type="button"
              onClick={() =>
                narration.speaking ? narration.stop() : void narration.play(spokenPrompt)
              }
              disabled={narration.loading}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-civic-300 bg-white px-4 text-[0.875rem] font-semibold text-civic-800 transition hover:bg-civic-50 disabled:opacity-40"
            >
              {narration.speaking ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
              {narration.speaking ? t.report.confirmStopSpeaking : t.report.confirmListenAgain}
            </button>
          </div>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        <div className="flex flex-col gap-2.5">
          {/*
            Both scripts on one button, because both readers must be able to
            act on it: the English label for the page around it, and the Urdu
            one because the voice just told the citizen to press exactly this.
          */}
          <Button size="full" onClick={confirmYes} loading={busy}>
            <span className="inline-flex items-center gap-2.5">
              <span>{t.report.confirmYes}</span>
              <span aria-hidden="true" className="opacity-50">·</span>
              <span lang="ur" className="text-[1.0625rem]">
                {t.report.confirmYesUr}
              </span>
            </span>
          </Button>

          {/*
            "No" now has two meanings, and they are not the same thing. The
            photo can be wrong — retake it. Or the photo can be right and the
            AI's reading of it incomplete, which is the common case and used to
            have no answer but starting over. Speaking is that answer: the
            words go to the describe step, so disagreeing costs a sentence
            rather than the whole flow.
          */}
          {spokenPrompt ? (
            <div dir="rtl" lang="ur" className="rounded-[18px] border border-line bg-surface p-3.5">
              <p className="mb-2.5 text-center text-[0.875rem] font-semibold text-ink">
                {t.report.confirmSpeakYourProblem}
              </p>
              <VoiceRecorder onRecorded={handleVoiceCorrection} disabled={busy} />
            </div>
          ) : null}

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
