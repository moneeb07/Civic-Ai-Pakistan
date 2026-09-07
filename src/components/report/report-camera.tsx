"use client";

import * as React from "react";
import Image from "next/image";
import {
  Camera,
  Circle,
  CircleAlert,
  Droplets,
  ImageUp,
  Lightbulb,
  RotateCcw,
  Sun,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import type { Dictionary } from "@/lib/i18n";
import { prepareReportImage } from "@/lib/image";


type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

/*
 * The three tips beside the illustration. Icon, a real dictionary title, a
 * real dictionary body — built per render because the titles are translated
 * and a module constant would freeze them to whichever language the process
 * started in.
 */
function tipsFor(t: Dictionary) {
  return [
    { icon: Camera, title: t.report.tipDownTitle, body: t.report.tipDownBody },
    { icon: Circle, title: t.report.tipCenteredTitle, body: t.report.tipCenteredBody },
    { icon: Sun, title: t.report.tipLightingTitle, body: t.report.tipLightingBody },
  ];
}

/*
 * The four examples under "Common issues you can report".
 *
 * `photo` is deliberately optional and currently unset for all four: this
 * section is designed for real photographs of each issue, supplied as
 * assets, and none has been added to the project yet. Until one exists for
 * a category, that tile falls back to the same tinted icon chip already
 * used for this exact set of categories on the citizen dashboard — a real,
 * shipped fallback, not a placeholder image inventing a photo that isn't
 * there. Drop a file at the path in `photo` and the tile switches to it
 * automatically, no other change needed.
 */
const ISSUE_EXAMPLES: {
  category: "POTHOLE" | "GARBAGE" | "BROKEN_STREETLIGHT" | "WATER_LEAKAGE";
  icon: React.ComponentType<{ className?: string }>;
  tone: "warning" | "success" | "warning" | "neutral";
  photo?: string;
}[] = [
  { category: "POTHOLE", icon: TriangleAlert, tone: "warning" },
  { category: "GARBAGE", icon: Trash2, tone: "success" },
  { category: "BROKEN_STREETLIGHT", icon: Lightbulb, tone: "warning" },
  { category: "WATER_LEAKAGE", icon: Droplets, tone: "neutral" },
];

const TONE_BG: Record<string, string> = {
  success: "bg-status-resolved-bg text-status-resolved",
  warning: "bg-status-process-bg text-status-process",
  neutral: "bg-civic-50 text-civic-700",
};

/*
 * A plain point-and-shoot camera for photographing a civic problem.
 *
 * Deliberately NOT the CNIC scanner's smart auto-capture component: that one
 * is built entirely around fitting a rectangular ID card into a guide and
 * auto-firing once the frame heuristics pass. The brief for this feature says
 * the opposite — "do not force the user to fit the issue into an artificial
 * tiny rectangle... the problem may occupy only part of the image" — so this
 * is an ordinary live preview with a manual shutter button and a gallery
 * fallback, nothing more.
 */
export function ReportCamera({
  onCaptured,
  disabled,
}: {
  onCaptured: (image: { blob: Blob; dataUrl: string }) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = React.useState<CameraState>("idle");
  const [preview, setPreview] = React.useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unavailable");
      return;
    }

    setCameraState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera is the one pointed at the world, not the citizen.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setCameraState("live");
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      setCameraState(
        name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
      );
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);

      const raw = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95),
      );
      if (!raw) throw new Error("capture failed");

      const prepared = await prepareReportImage(raw);
      stopCamera();
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
    } catch {
      setError(t.report.unexpectedError);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const prepared = await prepareReportImage(file);
      stopCamera();
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
    } catch {
      setError("We couldn't read that image. Please try another photo.");
    } finally {
      setBusy(false);
    }
  }

  // -- Preview: confirm or retake -------------------------------------------
  if (preview) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[20px] border border-line bg-ink/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.dataUrl} alt="The photo you just took of the problem" className="w-full" />
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button variant="secondary" size="full" onClick={() => setPreview(null)} disabled={disabled}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t.report.retake}
          </Button>
          <Button size="full" onClick={() => onCaptured(preview)} disabled={disabled}>
            {t.report.usePhoto}
          </Button>
        </div>
      </div>
    );
  }

  // -- Live camera -----------------------------------------------------------
  if (cameraState === "live" || cameraState === "starting") {
    return (
      <div className="space-y-4">
        <p className="text-center text-[0.8125rem] leading-relaxed text-muted">
          {t.report.cameraInstruction}
        </p>

        <div className="relative overflow-hidden rounded-[20px] bg-ink">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
          />
          {cameraState === "starting" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
              <span className="rounded-full bg-ink/70 px-4 py-2 text-[0.8125rem] font-medium text-white backdrop-blur">
                Starting camera…
              </span>
            </div>
          ) : null}
        </div>

        <Button size="full" onClick={capture} loading={busy} disabled={cameraState !== "live" || disabled}>
          {!busy ? <Camera className="size-4" aria-hidden="true" /> : null}
          {t.report.capture}
        </Button>
      </div>
    );
  }

  // -- Idle / denied / unavailable ------------------------------------------
  return (
    <div className="space-y-4">
      {cameraState === "denied" || cameraState === "unavailable" ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-[0.875rem] font-semibold text-amber-900">{t.report.cameraUnavailableTitle}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[0.875rem] text-danger">{error}</p>
        </div>
      ) : null}

      {/*
        The instructional card. The heading above this component already says
        WHAT to do ("Point your camera at the problem"); this card is HOW —
        an illustration of the exact gesture, the three things that make a
        photo usable, and a reminder of what counts as reportable. A citizen
        should be able to act from the picture alone, without reading a word
        of the text beside it.
      */}
      <div className="rounded-[24px] border-2 border-dashed border-line-strong bg-surface p-5 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] sm:items-center sm:gap-8">
          <div className="mx-auto w-full max-w-[240px] sm:max-w-none sm:max-h-[360px]">
            <Image
              src="/report-camera-illustration.webp"
              alt="Two hands holding a phone, camera aimed at a pothole in the road, framed and ready to photograph"
              width={900}
              height={1125}
              className="mx-auto h-auto max-h-[360px] w-full object-contain"
              priority
            />
          </div>

          <ul className="space-y-4">
            {tipsFor(t).map((tip) => {
              const Icon = tip.icon;
              return (
                <li key={tip.title} className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-civic-100 text-civic-700">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-semibold text-ink">{tip.title}</p>
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{tip.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6 border-t border-line pt-5 sm:mt-8 sm:pt-6">
          <p className="text-[0.8125rem] font-semibold text-ink">{t.report.commonIssuesPrompt}</p>

          <ul className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ISSUE_EXAMPLES.map((example) => {
              const Icon = example.icon;
              const label = t.report.categories[example.category];
              return (
                <li key={example.category}>
                  <div className="overflow-hidden rounded-[14px] border border-line bg-canvas">
                    <div className="relative aspect-square">
                      {example.photo ? (
                        <Image
                          src={example.photo}
                          alt={label}
                          fill
                          sizes="140px"
                          className="object-cover"
                        />
                      ) : (
                        <div
                          className={`flex size-full items-center justify-center ${TONE_BG[example.tone]}`}
                        >
                          <Icon className="size-7" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 text-center text-[0.75rem] font-medium leading-tight text-ink">
                    {label}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button
          size="full"
          onClick={startCamera}
          disabled={disabled || busy}
          className={cameraState === "denied" ? "hidden sm:inline-flex" : undefined}
        >
          <Camera className="size-4" aria-hidden="true" />
          {cameraState === "denied" || cameraState === "unavailable" ? t.report.tryAgain : t.report.allowCamera}
        </Button>

        <Button variant="secondary" size="full" onClick={() => fileInputRef.current?.click()} loading={busy} disabled={disabled}>
          {!busy ? <ImageUp className="size-4" aria-hidden="true" /> : null}
          {t.report.chooseFromGallery}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
