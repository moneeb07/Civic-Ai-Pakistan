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

  /*
   * Memoised, and that is not a performance tweak — it is the whole reason
   * this hook stopped stuttering.
   *
   * Returning a fresh object here gave `speak` a new identity on every render.
   * useStepAnnouncement lists `speak` in its dependencies, so the effect
   * re-ran, and `speak` begins by cancelling whatever is currently playing.
   * Speaking also sets `speaking`, which re-renders, which produced another
   * new object — a loop that cut the utterance off a fraction of a second in
   * and immediately restarted it, so "Upload your CNIC" came out as "up up up
   * up". The object must stay stable across the `speaking` changes that
   * speaking itself causes.
   */
  return React.useMemo(
    () => ({ supported, speaking, speak, stop }),
    [supported, speaking, speak, stop],
  );
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

  /*
   * Depends on `speech.speak`, never on `speech` itself. The parent object
   * changes identity whenever `speaking` flips; the speak function does not,
   * and taking the whole object here would reintroduce the churn the memo
   * above exists to prevent.
   */
  const inner = speech.speak;
  const speak = React.useCallback(
    (phrase: string) => {
      if (!enabled) return;
      inner(phrase);
    },
    [enabled, inner],
  );

  return React.useMemo(() => ({ ...speech, speak }), [speech, speak]);
}

/** Speaks a step's instruction once when the screen opens. */
export function useStepAnnouncement(phrase: string) {
  const { enabled } = useAssistedMode();
  const { speak, supported } = useVoiceGuidance();

  /*
   * `speak` is read through a ref rather than depended on.
   *
   * "Once when the screen opens" is a promise about the PHRASE, not about the
   * speak function, and the two are not the same thing: any future change to
   * how speaking is wired would otherwise be able to re-trigger the
   * announcement, which is the class of bug that made this stutter in the
   * first place. Pinning the dependencies to what the sentence actually
   * depends on — the phrase, and whether the citizen wants to hear it — makes
   * that impossible to reintroduce from a distance.
   */
  const speakRef = React.useRef(speak);
  React.useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  React.useEffect(() => {
    if (!enabled || !supported) return;

    // Small delay so the screen has painted before the voice starts.
    const timer = window.setTimeout(() => speakRef.current(phrase), 350);
    return () => window.clearTimeout(timer);
  }, [enabled, supported, phrase]);
}
