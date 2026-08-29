"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Info, RotateCcw, UserRound, X } from "lucide-react";

import { VoiceAssistBar } from "@/components/assisted/voice-assist-bar";
import { StepHeading } from "@/components/registration/registration-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { prepareProfileImage } from "@/lib/image";

const t = getDictionary();

/*
 * Profile photo — optional, and only a profile photo.
 *
 * No face detection, no comparison against the CNIC portrait, no biometric
 * claim of any kind. The screen says so, because a citizen handing over a
 * photograph deserves to know what happens to it.
 */
export function PhotoStep() {
  const router = useRouter();

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [cameraLive, setCameraLive] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraLive(false);
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t.identity.permissionBody);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Front camera for a self-portrait.
        video: { facingMode: { ideal: "user" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraLive(true);
    } catch {
      setError(t.identity.permissionBody);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;

      // Centre-crop to a square so the avatar is never distorted.
      canvas
        .getContext("2d")
        ?.drawImage(
          video,
          (video.videoWidth - size) / 2,
          (video.videoHeight - size) / 2,
          size,
          size,
          0,
          0,
          size,
          size,
        );

      const raw = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!raw) throw new Error("capture failed");

      const prepared = await prepareProfileImage(raw);
      stopCamera();
      setPreview(prepared.dataUrl);
    } catch {
      setError(t.errors.unexpected);
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
      const prepared = await prepareProfileImage(file);
      stopCamera();
      setPreview(prepared.dataUrl);
    } catch {
      setError("We couldn't read that image. Please try another photo.");
    } finally {
      setBusy(false);
    }
  }

  async function save(image: string | null) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/registration/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "photo",
          values: image ? { image } : null,
        }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? t.errors.unexpected);
        setBusy(false);
        return;
      }

      router.push("/register/confirm");
    } catch {
      setError(t.errors.network);
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeading title={t.photo.title} subtitle={t.photo.subtitle} />
      <VoiceAssistBar phrase={t.voice.photo} className="mb-5" />

      {error ? <div className="mb-5"><FormAlert message={error} /></div> : null}

      <div className="space-y-4">
        {cameraLive ? (
          <div className="relative overflow-hidden rounded-[20px] bg-ink">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-square w-full object-cover"
            />
            <button
              type="button"
              onClick={stopCamera}
              aria-label={t.identity.cancel}
              className="absolute end-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur transition-colors hover:bg-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative size-44 overflow-hidden rounded-full border-4 border-surface bg-civic-50 shadow-[var(--shadow-card)]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Your profile photo" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center">
                  <UserRound className="size-16 text-civic-500" aria-hidden="true" />
                </span>
              )}
            </div>
          </div>
        )}

        {cameraLive ? (
          <Button size="full" onClick={capture} loading={busy}>
            {!busy ? <Camera className="size-4" aria-hidden="true" /> : null}
            {t.identity.capture}
          </Button>
        ) : preview ? (
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              variant="secondary"
              size="full"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t.photo.retake}
            </Button>
            <Button size="full" onClick={() => save(preview)} loading={busy}>
              {t.photo.use}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button size="full" onClick={startCamera} disabled={busy}>
              <Camera className="size-4" aria-hidden="true" />
              {t.photo.take}
            </Button>
            <Button
              variant="secondary"
              size="full"
              onClick={() => fileInputRef.current?.click()}
              loading={busy}
            >
              {!busy ? <ImageUp className="size-4" aria-hidden="true" /> : null}
              {t.photo.choose}
            </Button>
          </div>
        )}

        {!cameraLive && !preview ? (
          <Button variant="ghost" size="full" onClick={() => save(null)} disabled={busy}>
            {t.photo.skip}
          </Button>
        ) : null}

        <div className="flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            {t.photo.notBiometric}
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}
