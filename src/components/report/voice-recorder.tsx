"use client";

import * as React from "react";
import { CircleAlert, Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";


type RecorderState = "idle" | "listening" | "processing" | "denied" | "unavailable";

/** Hard safety cap — long enough for a real description, short enough that nobody records a 20-minute file by accident. */
const MAX_DURATION_MS = 90_000;

/*
 * Microphone recording for a spoken complaint description.
 *
 * Entirely separate from the app's other "voice" system (VoiceAssistBar,
 * text-to-speech accessibility guidance) — this one takes audio IN, that one
 * only ever reads text OUT. They share no code and no state on purpose.
 *
 * States match the brief exactly: idle -> listening -> processing -> ready
 * (the "ready" state is the caller's — this component hands back a blob and
 * lets the parent decide what "ready" looks like, since that also involves
 * the transcription round-trip).
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const maxDurationTimeoutRef = React.useRef<number | null>(null);

  const [state, setState] = React.useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const elapsedIntervalRef = React.useRef<number | null>(null);

  const cleanup = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (maxDurationTimeoutRef.current !== null) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  function pickMimeType(): string {
    const candidates = ["audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(candidate)) {
        return candidate;
      }
    }
    return "audio/webm";
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        setState("processing");
        onRecorded(blob, mimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("listening");
      setElapsedMs(0);

      const startedAt = Date.now();
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 200);

      maxDurationTimeoutRef.current = window.setTimeout(() => {
        stop();
      }, MAX_DURATION_MS);
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }

  function stop() {
    mediaRecorderRef.current?.stop();
  }

  /** Lets the parent reset back to idle after handling (or failing to handle) a recording. */
  const reset = React.useCallback(() => setState("idle"), []);

  const seconds = Math.floor(elapsedMs / 1000);

  if (state === "denied" || state === "unavailable") {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-[0.875rem] font-semibold text-amber-900">
            {state === "denied" ? t.report.micPermissionBody : t.report.micUnavailableBody}
          </p>
          <Button variant="secondary" size="default" className="mt-3 min-h-9 px-3 text-[0.8125rem]" onClick={reset}>
            {t.report.tryAgain}
          </Button>
        </div>
      </div>
    );
  }

  if (state === "listening") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-surface p-8">
        <span className="relative flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-danger/20" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-danger/10">
            <Mic className="size-7 text-danger" aria-hidden="true" />
          </span>
        </span>
        <div className="text-center">
          <p className="text-[0.9375rem] font-semibold text-ink">{t.report.listening}</p>
          <p className="mt-1 text-[0.8125rem] text-muted">{t.report.tapWhenFinished}</p>
          <p className="mt-1 font-mono text-[0.8125rem] text-muted" aria-live="polite">
            0:{seconds.toString().padStart(2, "0")}
          </p>
        </div>
        <Button onClick={stop} className="min-w-40">
          <Square className="size-4" aria-hidden="true" />
          Stop
        </Button>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-line bg-surface p-8 text-center">
        <span className="relative flex size-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-civic-100" />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-civic-100">
            <Mic className="size-6 text-civic-700" aria-hidden="true" />
          </span>
        </span>
        <p className="text-[0.9375rem] font-semibold text-ink">{t.report.processingVoice}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      className={cn(
        "flex w-full flex-col items-center gap-3 rounded-[20px] border-2 border-dashed border-civic-200 bg-civic-50/60 p-8 text-center transition-colors hover:bg-civic-50 disabled:pointer-events-none disabled:opacity-55",
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-civic-100">
        <Mic className="size-6 text-civic-700" aria-hidden="true" />
      </span>
      <span className="text-[0.9375rem] font-semibold text-civic-700">{t.report.useVoice}</span>
    </button>
  );
}
