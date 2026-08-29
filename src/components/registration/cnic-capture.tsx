"use client";

import * as React from "react";
import { Camera, CircleAlert, ImageUp, Loader2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  analyzeCnicFrame,
  type FrameIssue,
  type FrameQualityResult,
} from "@/lib/cnic-frame-quality";
import { getDictionary } from "@/lib/i18n";
import { prepareCnicImage } from "@/lib/image";
import { cn } from "@/lib/utils";

const t = getDictionary();

type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

/*
 * The one authoritative readiness state. Border colour, status badge,
 * instruction text and auto-capture arming are ALL derived from this single
 * value — there is deliberately no second opinion anywhere in the component.
 * The previous version drew the border from a ref while the messages came
 * from React state, which let the two disagree for a frame at a time.
 */
type CaptureStatus =
  | "detecting"
  | "not_detected"
  | "need_adjustment"
  | "ready"
  | "capturing";

/*
 * Smart auto-capture tuning.
 *
 * ANALYSIS_INTERVAL_MS: how often the heuristics in cnic-frame-quality.ts
 *   actually run. The canvas repaints the live video every animation frame
 *   regardless — this only throttles the (slightly heavier) pixel analysis.
 * STABLE_TICKS_REQUIRED: consecutive good analyses before capture arms. At the
 *   interval above that is ~750ms of steadiness — enough that a single lucky
 *   frame can't fire the shutter, short enough that a citizen holding a
 *   readable card isn't left waiting and wondering.
 * CAPTURE_DELAY_MS: a short pause after the guide turns green, so "CNIC looks
 *   clear. Hold still…" is actually readable before the screen changes.
 */
const ANALYSIS_INTERVAL_MS = 150;
const STABLE_TICKS_REQUIRED = 5;
const CAPTURE_DELAY_MS = 400;

/** Internal analysis resolution — the crop is downsampled to this width regardless of camera resolution. */
const ANALYSIS_WIDTH = 240;
/** Live preview resolution cap, so a high-megapixel phone camera doesn't redraw a huge canvas 60x/sec. */
const MAX_DISPLAY_DIMENSION = 1280;

/** CNIC is ID-1 format: 85.6 × 54mm ≈ 1.586:1. */
const CNIC_ASPECT = 1.586;
const GUIDE_WIDTH_FRACTION = 0.86;

/**
 * The analysed region is this much larger than the drawn guide, in each
 * dimension.
 *
 * Without the padding the guide is exactly CNIC-shaped, so a card placed
 * PERFECTLY — filling the frame the citizen was told to fill — covers ~100% of
 * the analysed crop and touches all four of its edges. That reads as
 * "too close" and "incomplete" simultaneously: the better the citizen aims,
 * the harder it fails. Padding gives a correctly-placed card visible air on
 * every side, which is what the coverage and edge-touch checks are actually
 * looking for.
 */
const ANALYSIS_PADDING = 1.2;

/*
 * Development-only diagnostics. When the card is plainly readable but the
 * border stays red, this is the difference between reading the code and just
 * seeing which single check disagrees. Compiled out of production builds
 * entirely — the constant folds to false and the panel's JSX is dropped.
 */
const SHOW_DEBUG = process.env.NODE_ENV !== "production";

interface GuideRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function guideRectFor(width: number, height: number): GuideRect {
  // Fit the CNIC-shaped guide inside the box on whichever axis binds first —
  // a portrait (3:4) phone frame is constrained by width, a landscape one
  // by height. Without this the guide overflows a tall frame entirely.
  const w = Math.min(width * GUIDE_WIDTH_FRACTION, height * 0.86 * CNIC_ASPECT);
  const h = w / CNIC_ASPECT;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The padded region actually handed to the analyser, clamped to the frame. */
function analysisRectFor(guide: GuideRect, width: number, height: number): GuideRect {
  const w = Math.min(width, guide.w * ANALYSIS_PADDING);
  const h = Math.min(height, guide.h * ANALYSIS_PADDING);
  return {
    x: Math.max(0, Math.min(width - w, guide.x - (w - guide.w) / 2)),
    y: Math.max(0, Math.min(height - h, guide.y - (h - guide.h) / 2)),
    w,
    h,
  };
}

function drawGuide(ctx: CanvasRenderingContext2D, guide: GuideRect, ready: boolean) {
  const colour = ready ? "#0b8f6a" : "#dc2626";
  const radius = Math.max(8, guide.w * 0.035);

  ctx.save();

  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(2, guide.w * 0.008);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(guide.x, guide.y, guide.w, guide.h, radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(guide.x, guide.y, guide.w, guide.h);
  }

  // Bolder corner brackets, matching CivicAI's existing frame styling.
  const bracket = guide.w * 0.09;
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(4, guide.w * 0.018);
  ctx.lineCap = "round";
  const corners: [number, number, number, number][] = [
    [guide.x, guide.y, 1, 1],
    [guide.x + guide.w, guide.y, -1, 1],
    [guide.x, guide.y + guide.h, 1, -1],
    [guide.x + guide.w, guide.y + guide.h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * bracket);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * bracket, cy);
    ctx.stroke();
  }

  ctx.restore();
}

interface CnicCaptureProps {
  /** Receives a compressed JPEG ready to upload. */
  onCaptured: (image: { blob: Blob; dataUrl: string }) => void;
  disabled?: boolean;
  /** Overrides the frame instruction — used to distinguish front from back capture. */
  frameLabel?: string;
  /** Overrides the alt text on the confirmation preview. */
  previewAlt?: string;
}

/*
 * CNIC capture: a live, AI-guided camera that watches position, distance,
 * lighting, glare, tilt and sharpness in real time and captures on its own
 * once everything is genuinely good — plus upload and manual-capture
 * fallbacks, so a citizen is never stuck if auto-capture doesn't fire.
 *
 * Every failure path is handled explicitly — no camera hardware, permission
 * refused, an unreadable file — and each one leaves the citizen a way forward
 * rather than a dead end.
 */
export function CnicCapture({
  onCaptured,
  disabled,
  frameLabel = t.identity.frameLabel,
  previewAlt = "The CNIC photo you just took",
}: CnicCaptureProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const rafRef = React.useRef<number | null>(null);
  const captureTimeoutRef = React.useRef<number | null>(null);
  const lastAnalysisRef = React.useRef(0);
  const streakRef = React.useRef(0);
  /** The authoritative status, mirrored into React state below for rendering. */
  const statusRef = React.useRef<CaptureStatus>("detecting");
  const issueRef = React.useRef<FrameIssue | null>(null);
  /** Set once the photo is actually being taken — past the point an abort could help. */
  const captureInFlightRef = React.useRef(false);

  const [cameraState, setCameraState] = React.useState<CameraState>("idle");
  const [preview, setPreview] = React.useState<{ blob: Blob; dataUrl: string } | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<CaptureStatus>("detecting");
  const [issue, setIssue] = React.useState<FrameIssue | null>(null);
  const [debug, setDebug] = React.useState<FrameQualityResult | null>(null);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");

    /*
     * Guidance state is reset here — from an event-handler path (cancel,
     * or the end of a successful capture) — rather than inside the effect
     * that starts the loop. A retake always passes through here first
     * (the "Scan CNIC" button that re-triggers startCamera only renders
     * once cameraState is back to "idle"), so this is the one place that
     * needs to run, and it keeps the start-loop effect free of setState.
     */
    streakRef.current = 0;
    captureInFlightRef.current = false;
    issueRef.current = null;
    statusRef.current = "detecting";
    lastAnalysisRef.current = 0;
    setStatus("detecting");
    setIssue(null);
    setDebug(null);
  }, []);

  // Release the camera if the citizen navigates away mid-capture.
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
        // The rear camera is the one pointed at a document.
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

    captureInFlightRef.current = true;
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

      const prepared = await prepareCnicImage(raw);
      stopCamera();
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
    } catch {
      setError(t.errors.unexpected);
    } finally {
      setBusy(false);
    }
  }

  /*
   * Starts the live guidance loop once the camera goes live. The tick
   * function is declared locally (a plain function declaration, not a hook)
   * specifically so it can call itself by name — a `useCallback` referencing
   * its own variable inside its initializer is the kind of pattern the React
   * Compiler explicitly disallows, since it can't reason about a value that
   * depends on itself. Declaring it fresh inside the effect sidesteps that
   * entirely: it's an ordinary recursive callback, scoped to one camera
   * session, torn down with the rest of the effect when the session ends.
   *
   * It repaints the video every animation frame for a smooth preview, and —
   * throttled to ANALYSIS_INTERVAL_MS — crops the guide region straight from
   * the source video and runs the frame-quality heuristics on it. The border
   * is redrawn every frame from the last known result, so it stays visually
   * in sync even between analysis ticks.
   */
  React.useEffect(() => {
    if (cameraState !== "live" || disabled) return;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      /*
       * The canvas bitmap is sized to the element's OWN box, not the camera's
       * aspect ratio.
       *
       * This is the fix for the bug where the guide's left and right edges
       * were invisible. The bitmap used to match the video (16:9) while CSS
       * forced the box to 4:3 with object-cover, so the browser cropped the
       * sides off the bitmap — taking the guide's vertical edges with them,
       * and leaving the analysed region wider than anything the citizen could
       * see. Matching the bitmap to the box and doing the cover-crop here
       * means on-screen coordinates and analysis coordinates are finally the
       * same coordinates.
       */
      const box = canvas.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(
        1,
        MAX_DISPLAY_DIMENSION / Math.max(box.width * dpr, box.height * dpr),
      );
      const displayWidth = Math.round(box.width * dpr * scale);
      const displayHeight = Math.round(box.height * dpr * scale);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      /*
       * Cover-crop the video into the canvas by hand: take the largest
       * centred region of the source whose aspect matches the canvas. Keeping
       * this transform explicit is what lets the analysis crop below be
       * mapped back to real video pixels.
       */
      const sourceAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = canvas.width / canvas.height;

      let cropW = video.videoWidth;
      let cropH = video.videoHeight;
      if (sourceAspect > canvasAspect) {
        cropW = video.videoHeight * canvasAspect;
      } else {
        cropH = video.videoWidth / canvasAspect;
      }
      const cropX = (video.videoWidth - cropW) / 2;
      const cropY = (video.videoHeight - cropH) / 2;

      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const now = performance.now();
      /*
       * Analysis keeps running through the pre-capture hold, not just up to
       * it. If the citizen's hand drifts during those few hundred milliseconds
       * the photo would be taken anyway — so the hold is watched, and a dip in
       * quality cancels it. Only once the shutter has genuinely fired
       * (captureInFlightRef) does analysis stand down.
       */
      if (!captureInFlightRef.current && now - lastAnalysisRef.current >= ANALYSIS_INTERVAL_MS) {
        lastAnalysisRef.current = now;

        /*
         * The analysis crop is the padded guide expressed in canvas
         * coordinates, then mapped back through the cover-crop transform into
         * real video pixels — so the analyser reads exactly the region the
         * citizen sees inside the frame, sampled at the camera's native
         * resolution rather than from the downscaled preview.
         */
        const canvasGuide = guideRectFor(canvas.width, canvas.height);
        const canvasAnalysis = analysisRectFor(canvasGuide, canvas.width, canvas.height);

        const toSourceX = (x: number) => cropX + (x / canvas.width) * cropW;
        const toSourceY = (y: number) => cropY + (y / canvas.height) * cropH;

        const sourceX = toSourceX(canvasAnalysis.x);
        const sourceY = toSourceY(canvasAnalysis.y);
        const sourceW = (canvasAnalysis.w / canvas.width) * cropW;
        const sourceH = (canvasAnalysis.h / canvas.height) * cropH;

        // The analysis buffer matches the padded crop's aspect, so nothing is
        // squashed on the way in — squashing would skew the tilt estimate.
        const analysisHeight = Math.max(
          1,
          Math.round(ANALYSIS_WIDTH * (canvasAnalysis.h / canvasAnalysis.w)),
        );

        let analysisCanvas = analysisCanvasRef.current;
        if (!analysisCanvas) {
          analysisCanvas = document.createElement("canvas");
          analysisCanvasRef.current = analysisCanvas;
        }
        if (
          analysisCanvas.width !== ANALYSIS_WIDTH ||
          analysisCanvas.height !== analysisHeight
        ) {
          analysisCanvas.width = ANALYSIS_WIDTH;
          analysisCanvas.height = analysisHeight;
        }

        const actx = analysisCanvas.getContext("2d", { willReadFrequently: true });
        if (actx) {
          actx.drawImage(
            video,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            0,
            0,
            analysisCanvas.width,
            analysisCanvas.height,
          );

          const imageData = actx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
          const result = analyzeCnicFrame(imageData);

          /*
           * One decision point. Status, border, message and auto-capture all
           * flow from this single assignment — nothing downstream re-derives
           * readiness for itself.
           */
          const next: CaptureStatus = result.ready
            ? statusRef.current === "capturing"
              ? "capturing"
              : "ready"
            : result.issue === "no_card"
              ? "not_detected"
              : "need_adjustment";

          if (next !== statusRef.current) {
            statusRef.current = next;
            setStatus(next);
          }

          if (result.issue !== issueRef.current) {
            issueRef.current = result.issue;
            setIssue(result.issue);
          }

          if (SHOW_DEBUG) setDebug(result);

          if (result.ready) {
            streakRef.current += 1;
            if (
              streakRef.current >= STABLE_TICKS_REQUIRED &&
              statusRef.current !== "capturing"
            ) {
              statusRef.current = "capturing";
              setStatus("capturing");
              captureTimeoutRef.current = window.setTimeout(() => {
                // One last check at the shutter itself. Between the final
                // analysis tick and this moment the frame can still go bad.
                if (statusRef.current !== "capturing") return;
                void capture();
              }, CAPTURE_DELAY_MS);
            }
          } else {
            streakRef.current = 0;

            // Quality slipped mid-hold: stand the capture down and go back to
            // guiding, rather than taking the photo we already promised.
            if (captureTimeoutRef.current !== null) {
              window.clearTimeout(captureTimeoutRef.current);
              captureTimeoutRef.current = null;
            }
          }
        }
      }

      const displayGuide = guideRectFor(canvas.width, canvas.height);
      drawGuide(
        ctx,
        displayGuide,
        statusRef.current === "ready" || statusRef.current === "capturing",
      );

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (captureTimeoutRef.current !== null) window.clearTimeout(captureTimeoutRef.current);
      rafRef.current = null;
      captureTimeoutRef.current = null;
    };
    // capture() is stable across renders (only touches refs/setters), so it
    // is deliberately not a dependency — including it would restart the loop
    // (and reopen the camera-session timing) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState, disabled]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const prepared = await prepareCnicImage(file);
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
          <img
            src={preview.dataUrl}
            alt={previewAlt}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="secondary"
            size="full"
            onClick={() => setPreview(null)}
            disabled={disabled}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t.identity.retake}
          </Button>
          <Button
            size="full"
            onClick={() => onCaptured(preview)}
            disabled={disabled}
          >
            {t.identity.usePhoto}
          </Button>
        </div>
      </div>
    );
  }

  // -- Live camera -----------------------------------------------------------
  if (cameraState === "live" || cameraState === "starting") {
    /*
     * Everything below reads from `status` and nothing else. The message can
     * no longer contradict the border, because they are no longer two
     * independent derivations of "is this frame good" — a stale "CNIC is too
     * far" over a green border was exactly that bug.
     */
    const ready = status === "ready" || status === "capturing";

    // Exactly one message at a time: a short neutral line until the first
    // analysis lands (the full instruction is already shown once, as a static
    // caption above the camera — no need to repeat it here), then whichever
    // single issue matters most, then the hold-still cue.
    const pillText =
      cameraState === "starting"
        ? t.identity.cameraStarting
        : status === "detecting"
          ? t.identity.autoCapture.detecting
          : ready
            ? t.identity.autoCapture.statusPerfect
            : issue
              ? t.identity.autoCapture.issues[issue]
              : t.identity.autoCapture.detecting;

    const pillTone: "neutral" | "red" | "green" =
      cameraState === "starting" || status === "detecting"
        ? "neutral"
        : ready
          ? "green"
          : "red";

    return (
      <div className="space-y-4">
        <p className="text-center text-[0.8125rem] leading-relaxed text-muted">
          {t.identity.autoCapture.instruction}
        </p>

        <div className="relative overflow-hidden rounded-[20px] bg-ink">
          {/* The real frame source. Kept in normal layout (not display:none) so
              mobile browsers keep decoding it, but never shown directly — the
              canvas below draws the composited, annotated frame instead. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />

          {/* No object-cover: the bitmap is sized to this box and the
              cover-crop is done when drawing, so the guide can't be cropped
              off the sides. */}
          <canvas
            ref={canvasRef}
            className="aspect-[3/4] w-full sm:aspect-[4/3]"
          />

          {/*
            Status badge and instruction pill are stacked in one column,
            not two independently-positioned overlays — at typical phone
            widths the badge's full spec-mandated text ("Not Ready — Fix the
            highlighted issue") is wide enough that placing it beside the
            centered pill causes them to visually collide.
          */}
          <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-16">
            {status !== "detecting" && cameraState === "live" ? (
              <span
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.75rem] font-semibold text-white backdrop-blur",
                  ready ? "bg-civic-600/90" : "bg-danger/90",
                )}
              >
                {ready ? "🟢" : "🔴"}
                {ready ? t.identity.autoCapture.statusPerfect : t.identity.autoCapture.statusNotReady}
              </span>
            ) : null}

            <p
              className={cn(
                "w-fit max-w-full rounded-full px-4 py-2 text-center text-[0.8125rem] font-medium text-white backdrop-blur",
                pillTone === "red" && "bg-danger/90",
                pillTone === "green" && "bg-civic-600/90",
                pillTone === "neutral" && "bg-ink/75",
              )}
              aria-live="polite"
            >
              {pillText}
            </p>
          </div>

          <button
            type="button"
            onClick={stopCamera}
            aria-label={t.identity.cancel}
            className="absolute end-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur transition-colors hover:bg-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {SHOW_DEBUG ? <FrameDebugPanel result={debug} status={status} /> : null}

        <Button
          size="full"
          onClick={capture}
          loading={busy}
          disabled={cameraState !== "live" || disabled || status === "capturing"}
        >
          {!busy ? <Camera className="size-4" aria-hidden="true" /> : null}
          {t.identity.capture}
        </Button>
      </div>
    );
  }

  // -- Idle / denied / unavailable ------------------------------------------
  return (
    <div className="space-y-4">
      {cameraState === "denied" || cameraState === "unavailable" ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5"
        >
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-[0.875rem] font-semibold text-amber-900">
              {t.identity.permissionTitle}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-amber-800">
              {t.identity.permissionBody}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[0.875rem] text-danger">{error}</p>
        </div>
      ) : null}

      {/*
        Empty-state document frame, so the citizen knows what to expect.
        One dashed boundary, CNIC-shaped, on a plain card — not a dashed
        frame nested inside another dashed frame, which read as two
        unfinished placeholders stacked rather than one clear affordance.
      */}
      <div className="rounded-[20px] border border-line bg-surface p-6">
        <div className="mx-auto flex aspect-[1.586/1] w-full max-w-xs items-center justify-center rounded-[14px] border-2 border-dashed border-civic-200 bg-civic-50/60">
          <div className="text-center">
            <Camera className="mx-auto size-8 text-civic-500" aria-hidden="true" />
            <p className="mt-2 px-4 text-[0.8125rem] font-medium text-muted">
              {frameLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button
          size="full"
          onClick={startCamera}
          disabled={disabled || busy}
          className={cn(cameraState === "denied" && "hidden sm:inline-flex")}
        >
          <Camera className="size-4" aria-hidden="true" />
          {t.identity.scan}
        </Button>

        <Button
          variant="secondary"
          size="full"
          onClick={() => fileInputRef.current?.click()}
          loading={busy}
          disabled={disabled}
        >
          {!busy ? <ImageUp className="size-4" aria-hidden="true" /> : null}
          {t.identity.upload}
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

/*
 * Development-only diagnostics.
 *
 * The whole point is to answer one question instantly: the card is clearly
 * readable, so WHICH check is holding it at red? Each row shows the check, its
 * verdict, and the number behind the verdict, so a threshold that's wrong for
 * a real device is obvious rather than inferred.
 *
 * Never rendered in production — SHOW_DEBUG is false there and this subtree is
 * dropped at build time.
 */
function FrameDebugPanel({
  result,
  status,
}: {
  result: FrameQualityResult | null;
  status: CaptureStatus;
}) {
  if (!result) return null;

  const { checks, metrics } = result;
  const rows: [string, boolean, string][] = [
    ["CNIC detected", checks.detected, `coverage ${(metrics.coverageRatio * 100).toFixed(1)}%`],
    ["Distance", checks.distance, `coverage ${(metrics.coverageRatio * 100).toFixed(1)}%`],
    ["Complete in frame", checks.complete, `${metrics.edgeTouchCount} edge(s) touched`],
    [
      "Tilt",
      checks.tilt,
      metrics.tiltDegrees === null ? "no reading" : `${metrics.tiltDegrees.toFixed(1)}°`,
    ],
    ["Sharpness", checks.sharpness, metrics.sharpness.toFixed(1)],
    ["Lighting", checks.lighting, metrics.brightness.toFixed(0)],
    ["Glare", checks.glare, `${(metrics.glareRatio * 100).toFixed(1)}%`],
    ["Text readability", checks.readability, `${(metrics.textDetail * 100).toFixed(1)}%`],
  ];

  return (
    <div className="rounded-[14px] border border-dashed border-line-strong bg-ink/[0.03] p-3 font-mono text-[0.6875rem] leading-relaxed">
      <p className="mb-2 font-semibold uppercase tracking-wider text-muted">
        Frame debug · dev only
      </p>

      <div className="space-y-0.5">
        {rows.map(([label, pass, detail]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <span className={pass ? "text-civic-700" : "text-danger"}>
              {pass ? "PASS" : "FAIL"} {label}
            </span>
            <span className="text-muted">{detail}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-line pt-2">
        <div className="flex justify-between">
          <span className="text-muted">CAMERA STATE</span>
          <span className="font-semibold uppercase">{status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">AUTO CAPTURE</span>
          <span className="font-semibold">
            {status === "capturing" ? "ARMED" : result.ready ? "STABILISING" : "HELD"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The photography guidance shown beside the capture control. */
export function CaptureGuidance() {
  const items = [
    t.identity.guidance.flat,
    t.identity.guidance.light,
    t.identity.guidance.corners,
    t.identity.guidance.glare,
    t.identity.guidance.cover,
  ];

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {t.identity.guidance.heading}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[0.875rem] text-ink/80">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-civic-500"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Loader2 };
