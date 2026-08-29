"use client";

import * as React from "react";

import { useAssistedMode } from "./assisted-mode-provider";

/*
 * Voice guidance, via the browser's built-in speech synthesis.
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

export function useVoiceGuidance(): VoiceGuidance {
  const { enabled } = useAssistedMode();

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
      if (!enabled) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (!phrase) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(phrase);
      // Roman Urdu read by an Urdu voice where the device has one; browsers
      // fall back to the default voice otherwise.
      utterance.lang = "ur-PK";
      utterance.rate = 0.92;

      const urduVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang?.toLowerCase().startsWith("ur"));
      if (urduVoice) utterance.voice = urduVoice;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [enabled],
  );

  // Never leave a phrase playing after the citizen navigates away.
  React.useEffect(() => stop, [stop]);

  return { supported, speaking, speak, stop };
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
