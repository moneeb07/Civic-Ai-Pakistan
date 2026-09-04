"use client";

import * as React from "react";

import { useAssistedMode } from "./assisted-mode-provider";

/*
 * Voice guidance, via the browser's built-in speech synthesis.
 *
 * Reads in an Urdu voice where the device has one and a Hindi voice where it
 * does not — see VOICE_PREFERENCE below for why that substitution works.
 *
 * Speech is generated on the device: nothing a citizen sees or types is sent to
 * a speech service, and no audio is recorded. The assistant only ever reads
 * fixed instructional phrases from the dictionary — it cannot be handed a
 * password, a CNIC number, or any other field value.
 */

export interface VoiceGuidance {
  supported: boolean;
  speaking: boolean;
  /** Reads a fixed instruction aloud. Ignored when Assisted Mode is off. */
  speak: (phrase: string) => void;
  stop: () => void;
}

/*
 * Speech-synthesis availability is fixed for the lifetime of the page, but it
 * can only be read in the browser. useSyncExternalStore reports `false` during
 * server rendering and the real value on the client, without a hydration
 * mismatch and without setting state from an effect.
 */
const neverChanges = () => () => {};
const supportedOnClient = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;
const supportedOnServer = () => false;

/*
 * Which installed voice reads the instructions, in order of preference.
 *
 * Urdu first, because the phrases are Roman Urdu and an Urdu voice is what
 * they were written for. Hindi second, and that is the whole point of this
 * list rather than a lone lookup: spoken Hindi and Urdu are close to the same
 * language, so a Hindi voice reading Roman Urdu is genuinely intelligible,
 * where the English default that browsers otherwise fall back to pronounces
 * "gaddha" and "shukriya" as nonsense.
 *
 * Most Android and Windows installs ship a Hindi voice and no Urdu one, so in
 * practice this second rung is the one that usually answers.
 */
const VOICE_PREFERENCE = ["ur", "hi"];

function pickVoice(
  voices: SpeechSynthesisVoice[],
): { voice: SpeechSynthesisVoice; language: string } | null {
  for (const language of VOICE_PREFERENCE) {
    const voice = voices.find((candidate) =>
      candidate.lang?.toLowerCase().startsWith(language),
    );
    if (voice) return { voice, language };
  }
  // No match: the caller asks for ur-PK anyway and lets the browser decide,
  // which is still better than silently reading it as English.
  return null;
}

/**
 * Speaking, with no policy attached.
 *
 * Split out from useVoiceGuidance because two callers want the same voice for
 * genuinely different reasons. Assisted Mode reads UI instructions to citizens
 * who asked for that help. The photo-confirmation step reads back what the AI
 * believes it is looking at — and that is not an accessibility aid, it is the
 * question being asked, so it must not be silent for someone who never turned
 * Assisted Mode on. Same voice selection, same cancellation, different gate.
 */
export function useSpeech(): VoiceGuidance {
  const supported = React.useSyncExternalStore(
    neverChanges,
    supportedOnClient,
    supportedOnServer,
  );

  const [speaking, setSpeaking] = React.useState(false);

  const stop = React.useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = React.useCallback(
    (phrase: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (!phrase) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 0.92;

      const chosen = pickVoice(window.speechSynthesis.getVoices());
      if (chosen) {
        utterance.voice = chosen.voice;
        // Set from the chosen voice rather than hardcoded: asking for ur-PK
        // while handing the engine a Hindi voice gives some browsers a
        // mismatch they resolve by ignoring the voice entirely.
        utterance.lang = chosen.voice.lang;
      } else {
        utterance.lang = "ur-PK";
      }

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  // Never leave a phrase playing after the citizen navigates away.
  React.useEffect(() => stop, [stop]);

  return { supported, speaking, speak, stop };
}

/**
 * Speaking, gated on Assisted Mode.
 *
 * The original hook, unchanged in behaviour: `speak` does nothing when the
 * citizen has not turned Assisted Mode on. Kept as the default for UI
 * narration so no existing screen starts talking unasked.
 */
export function useVoiceGuidance(): VoiceGuidance {
  const { enabled } = useAssistedMode();
  const speech = useSpeech();

  const speak = React.useCallback(
    (phrase: string) => {
      if (!enabled) return;
      speech.speak(phrase);
    },
    [enabled, speech],
  );

  return { ...speech, speak };
}

/** Speaks a step's instruction once when the screen opens. */
export function useStepAnnouncement(phrase: string) {
  const { enabled } = useAssistedMode();
  const { speak, supported } = useVoiceGuidance();

  React.useEffect(() => {
    if (!enabled || !supported) return;

    // Small delay so the screen has painted before the voice starts.
    const timer = window.setTimeout(() => speak(phrase), 350);
    return () => window.clearTimeout(timer);
  }, [enabled, supported, phrase, speak]);
}
