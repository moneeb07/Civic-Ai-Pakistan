"use client";

import * as React from "react";
import { Ear, Volume2, VolumeX, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { useAssistedMode } from "./assisted-mode-provider";
import { useSpokenGuidance } from "./use-spoken-guidance";


/*
 * The Assisted Mode surface shown on every registration step.
 *
 * Three states:
 *   off      — a quiet "Need help?" affordance
 *   offered  — a prompt, shown only after a screen has caused repeated trouble
 *   on       — a control bar that can repeat or stop the instruction
 *
 * It announces the step's instruction but never takes an action on the
 * citizen's behalf; every button here is theirs to press.
 */
export function VoiceAssistBar({
  phrase,
  className,
}: {
  phrase: string;
  className?: string;
}) {
  const t = useT();
  const { enabled, setEnabled, shouldOffer, dismissOffer } = useAssistedMode();

  /*
   * The provider's voice, with the device's as a fallback — see
   * use-spoken-guidance.ts. This bar used to drive `speechSynthesis`
   * directly, which is why it sat there saying "Voice guidance on" while
   * playing nothing on the deployed site.
   */
  const { speaking, loading, needsGesture, play, stop } = useSpokenGuidance();

  /*
   * The step's instruction, spoken once when the screen opens.
   *
   * Depends on the phrase and on whether the citizen wants to hear it —
   * never on `play`, whose identity is not part of "has the sentence
   * changed". Tying an announcement to a function identity is what made the
   * voice repeat itself endlessly once before.
   */
  const playRef = React.useRef(play);
  React.useEffect(() => {
    playRef.current = play;
  }, [play]);

  React.useEffect(() => {
    if (!enabled) return;
    // A short delay so the screen has painted before the voice starts.
    const timer = window.setTimeout(() => playRef.current(phrase), 350);
    return () => window.clearTimeout(timer);
  }, [enabled, phrase]);

  /*
   * Speech synthesis is no longer what decides whether voice is on offer —
   * the server generates the audio, so a device with no voices installed can
   * still be read to. Only a browser with no <audio> at all could fail, and
   * that is not a browser this app runs in.
   */
  const supported = true;

  if (shouldOffer) {
    return (
      <div
        className={cn(
          "rounded-[18px] border border-civic-200 bg-civic-50 p-4",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <Ear className="mt-0.5 size-5 shrink-0 text-civic-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-ink">
              {t.assisted.offerTitle}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {supported ? t.assisted.offerBody : t.assisted.unsupported}
            </p>

            {supported ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setEnabled(true)} className="min-h-11 px-4 text-sm">
                  {t.assisted.accept}
                </Button>
                <Button
                  variant="secondary"
                  onClick={dismissOffer}
                  className="min-h-11 px-4 text-sm"
                >
                  {t.assisted.decline}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={dismissOffer}
                className="mt-3 min-h-11 px-4 text-sm"
              >
                {t.assisted.decline}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!enabled) {
    if (!supported) return null;

    return (
      <button
        type="button"
        onClick={() => setEnabled(true)}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[0.8125rem] font-semibold text-civic-700 transition-colors hover:border-civic-200 hover:bg-civic-50",
          className,
        )}
      >
        <Ear className="size-4" aria-hidden="true" />
        🎙️ {t.assisted.enable}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[18px] border border-civic-200 bg-civic-50 px-3 py-2.5",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-civic-700">
        <Volume2 className="size-4" aria-hidden="true" />
        {t.assisted.enabled}
      </span>

      <span className="flex-1" />

      {/*
        One button that stops what is playing or starts it again.

        It is ringed when the browser refused to autoplay: nothing is wrong,
        but the citizen is looking at "Voice guidance on" and hearing nothing,
        and the only thing that will fix that is a press. Pointing at the
        button is more use than an explanation of autoplay policy.
      */}
      <button
        type="button"
        disabled={loading}
        onClick={() => (speaking ? stop() : play(phrase))}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-civic-100 disabled:opacity-60",
          needsGesture && !speaking && "ring-2 ring-civic-500",
        )}
      >
        {speaking ? (
          <VolumeX className="size-3.5" aria-hidden="true" />
        ) : (
          <Volume2 className="size-3.5" aria-hidden="true" />
        )}
        {loading ? t.assisted.loading : t.assisted.repeat}
      </button>

      <button
        type="button"
        onClick={() => {
          stop();
          setEnabled(false);
        }}
        aria-label={t.assisted.disable}
        className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
