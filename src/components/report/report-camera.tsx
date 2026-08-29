"use client";

import * as React from "react";
import { Camera, CircleAlert, ImageUp, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { prepareReportImage } from "@/lib/image";

const t = getDictionary();

type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

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

      <div className="rounded-[20px] border-2 border-dashed border-line-strong bg-surface p-10">
        <div className="text-center">
          <Camera className="mx-auto size-10 text-civic-500" aria-hidden="true" />
          <p className="mt-3 text-[0.875rem] font-medium text-muted">{t.report.cameraTitle}</p>
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
