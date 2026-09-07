"use client";

import * as React from "react";

import { useSpeech } from "./use-voice-guidance";

/*
 * Speaking a registration instruction, server voice first.
 *
 * The device's own `speechSynthesis` is now the FALLBACK, not the mechanism.
 * It reports success and plays silence on any machine without an Urdu voice
 * installed, which is most of them — so a citizen saw "Voice guidance on" and
 * heard nothing at all, with no error anywhere to explain it. The provider's
 * voice is a property of the app rather than of whatever the citizen happened
 * to install, so it is what gets tried first.
 *
 * Mirrors useNarration in components/report/camera-flow.tsx. The two are not
 * merged because they are fenced differently — that one is scoped to a report
 * the citizen owns, this one to a fixed list of instructions and no account at
 * all — and folding them together would mean one endpoint with the looser of
 * the two guards.
 */

export interface SpokenGuidance {
  speaking: boolean;
  loading: boolean;
  /** True when the browser refused to autoplay — the citizen must press Repeat. */
  needsGesture: boolean;
  play: (phrase: string) => void;
  stop: () => void;
}

export function useSpokenGuidance(): SpokenGuidance {
  const speech = useSpeech();
  const { speak: browserSpeak, stop: browserStop } = speech;

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);

  const [speaking, setSpeaking] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [needsGesture, setNeedsGesture] = React.useState(false);

  const release = React.useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      // Blob URLs are held by the document until revoked; a citizen moving
      // through six registration steps would otherwise leak one per step.
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
    (phrase: string) => {
      stop();
      setLoading(true);

      void (async () => {
        try {
          const response = await fetch("/api/speech/guidance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phrase }),
          });

          if (response.status === 204) {
            // No voice on this provider — let the device try.
            setLoading(false);
            browserSpeak(phrase);
            setSpeaking(true);
            return;
          }

          if (!response.ok) throw new Error(`guidance failed: ${response.status}`);

          const url = URL.createObjectURL(await response.blob());
          urlRef.current = url;

          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => setSpeaking(false);
          audio.onerror = () => setSpeaking(false);

          setLoading(false);
          setSpeaking(true);

          try {
            await audio.play();
            setNeedsGesture(false);
          } catch {
            /*
             * Blocked by the browser's autoplay policy, which is a rule about
             * GESTURES and not about this app: audio that starts on its own,
             * before the citizen has touched anything, is refused outright in
             * Chrome and Safari.
             *
             * Nothing is broken and nothing should be announced as broken.
             * The same phrase plays the moment they press Repeat, so the flag
             * exists only to let the bar draw attention to that button.
             */
            setSpeaking(false);
            setNeedsGesture(true);
          }
        } catch {
          /*
           * Falling back rather than surfacing an error. The guidance is an
           * aid, not the step: a citizen who can read the screen is not
           * blocked by silence, and an error banner about audio would push the
           * actual instruction further down the page.
           */
          setLoading(false);
          browserSpeak(phrase);
          setSpeaking(true);
        }
      })();
    },
    /*
     * `speaking`, `loading` and `needsGesture` are deliberately NOT
     * dependencies. Every one of them is set BY this function, so including
     * them would give `play` a new identity each time it ran — and an effect
     * depending on `play` would then re-fire and replay the phrase for ever.
     * That exact loop is what made the voice stutter "up up up up".
     */
    [stop, browserSpeak],
  );

  // Never leave audio playing after the citizen moves to the next step.
  React.useEffect(() => release, [release]);

  return { speaking, loading, needsGesture, play, stop };
}
