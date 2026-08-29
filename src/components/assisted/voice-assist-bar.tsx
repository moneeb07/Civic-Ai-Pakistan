"use client";

import { Ear, Volume2, VolumeX, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAssistedMode } from "./assisted-mode-provider";
import { useStepAnnouncement, useVoiceGuidance } from "./use-voice-guidance";

const t = getDictionary();

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
  const { enabled, setEnabled, shouldOffer, dismissOffer } = useAssistedMode();
  const { supported, speaking, speak, stop } = useVoiceGuidance();

  useStepAnnouncement(phrase);

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

      <button
        type="button"
        onClick={() => (speaking ? stop() : speak(phrase))}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-civic-100"
      >
        {speaking ? (
          <>
            <VolumeX className="size-3.5" aria-hidden="true" />
            {t.assisted.repeat}
          </>
        ) : (
          <>
            <Volume2 className="size-3.5" aria-hidden="true" />
            {t.assisted.repeat}
          </>
        )}
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
