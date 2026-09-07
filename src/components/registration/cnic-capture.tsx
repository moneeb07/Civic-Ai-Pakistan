"use client";

import * as React from "react";
import {
  Camera,
  CircleAlert,
  ImageUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { useAssistedMode } from "@/components/assisted/assisted-mode-provider";
import { useVoiceGuidance } from "@/components/assisted/use-voice-guidance";
import { Button } from "@/components/ui/button";
import {
  analyzeCnicFrame,
  type FrameIssue,
  type FrameQualityResult,
  type FrameTier,
} from "@/lib/cnic-frame-quality";
import { getDictionary } from "@/lib/i18n";
import { prepareCnicImage, prepareCnicUpload } from "@/lib/image";
import { captureCropFor } from "@/lib/cnic-capture-crop";
import { qualitySignalsFrom } from "@/lib/cnic/signals";
import {
  CAPTURE_SETTLE_MS,
  preScreen,
  STABLE_FRAMES_REQUIRED,
  type CnicSide,
  type QualitySignals,
  type ValidationState,
} from "@/lib/cnic/validation";
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
 * Stability is shared with the validator (STABLE_FRAMES_REQUIRED): consecutive
 *   good analyses before capture arms, so a single lucky frame between two
 *   blurred ones can never fire the shutter.
 * CAPTURE_DELAY_MS: a short pause after the guide turns green, so "CNIC looks
 *   clear. Hold still…" is actually readable before the screen changes.
 */
const ANALYSIS_INTERVAL_MS = 150;
const CAPTURE_DELAY_MS = 400;

/**
 * How long the scanner will keep guiding before it admits it may not get there.
 *
 * Some cameras simply cannot resolve a CNIC — a low-resolution laptop webcam
 * is the common one, and no amount of repositioning fixes it. Without this the
 * citizen is left holding a card in front of a camera that will never fire,
 * with a red border telling them to keep trying. After this long the scanner
 * offers the gallery instead; it does not stop guiding, and auto-capture still
 * fires the moment the frame does come good.
 */
const STALL_HINT_MS = 12_000;

/** Internal analysis resolution — the crop is downsampled to this width regardless of camera resolution. */
const ANALYSIS_WIDTH = 240;
/** Live preview resolution cap, so a high-megapixel phone camera doesn't redraw a huge canvas 60x/sec. */
const MAX_DISPLAY_DIMENSION = 1280;

/*
 * The three border colours, matching the tiers in cnic-frame-quality.ts.
 * Drawn on the canvas rather than set in CSS because the frame is part of the
 * composited video, not an element layered over it.
 */
const TIER_COLOURS: Record<FrameTier, string> = {
  poor: "#dc2626",
  improving: "#f59e0b",
  acceptable: "#0b8f6a",
};

/**
 * Shortest gap between two spoken instructions.
 *
 * Voice guidance assists; it does not narrate. Without this floor a citizen
 * moving the card around would be talked over continuously by every passing
 * state change, which is worse than silence.
 */
const VOICE_MIN_INTERVAL_MS = 3500;

/** CNIC is ID-1 format: 85.6 × 54mm ≈ 1.586:1. */
const CNIC_ASPECT = 1.586;
const GUIDE_WIDTH_FRACTION = 0.86;


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

/**
 * The region handed to the analyser: the WHOLE frame.
 *
 * It used to be the guide rectangle plus 20% padding, and that was the reason
 * a perfectly presented card was reported "incomplete". If the citizen holds
 * the card so it fills the picture — which is exactly what you want for OCR —
 * the card is LARGER than that crop, so it ran off all four edges of the
 * analysed region and the edge-touch check concluded it was cut off. The card
 * could not be made "complete" by moving it closer, only by moving it further
 * away, which is the opposite of the advice the screen was giving.
 *
 * Analysing the full frame removes the ambiguity entirely: an edge touched now
 * means the card genuinely runs out of the picture, and coverage means its
 * share of what the camera can actually see. The drawn guide stays exactly as
 * it is — it is an aiming aid for the citizen, not the measurement boundary.
 */
function analysisRectFor(_guide: GuideRect, width: number, height: number): GuideRect {
  return { x: 0, y: 0, w: width, h: height };
}

function drawGuide(ctx: CanvasRenderingContext2D, guide: GuideRect, tier: FrameTier) {
  const colour = TIER_COLOURS[tier];
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
  /** Title shown in the full-screen scanner's top bar. */
  title?: string;
  /**
   * Which side of the card this instance is capturing.
   *
   * Required by the validator, which checks a DIFFERENT set of fields per
   * side — a back image is not expected to yield a CNIC number, and a front
   * is not expected to yield an address.
   */
  side: CnicSide;
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
  title = t.identity.autoCapture.scannerTitleFront,
  side,
}: CnicCaptureProps) {
  /*
   * Which face of the card this instance is asking for, said in the button.
   * "Scan CNIC" is ambiguous at the exact moment it matters — the citizen is
   * holding a two-sided card and has to know which face to present.
   */
  const scanLabel = side === "front" ? t.identity.scanFront : t.identity.scanBack;
  const uploadLabel = side === "front" ? t.identity.uploadFront : t.identity.uploadBack;

  const { enabled: voiceEnabled, setEnabled: setVoiceEnabled } = useAssistedMode();
  const { supported: voiceSupported, speak, stop: stopSpeaking } = useVoiceGuidance();
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
  /*
   * The live readability reading. Kept in state (not just a ref) because the
   * meter and the gauge are ordinary DOM, unlike the border, which is painted
   * into the canvas — but they all read from the same analysis result, so they
   * cannot drift apart.
   */
  /**
   * True once the scanner has been open a while without capturing — the cue to
   * offer the gallery rather than let a citizen keep trying a camera that
   * cannot resolve their card.
   */
  const [stalled, setStalled] = React.useState(false);

  /*
   * The verdict on the CAPTURED image — not on a live frame.
   *
   * This is the gate that did not exist. Previously the preview screen offered
   * "Use this photo" unconditionally, so a blurred capture was accepted on the
   * strength of local heuristics that had judged a different frame entirely.
   * Nothing may be handed to `onCaptured` until this says READABLE.
   */
  const [verdict, setVerdict] = React.useState<{
    state: ValidationState;
    score: number;
    instruction: string;
    unreadableFields: string[];
    observedSide: CnicSide | null;
  } | null>(null);
  /*
   * A failure to CHECK the image, kept separate from a verdict ON the image.
   *
   * Conflating the two told somebody holding a perfectly clear card that their
   * card was unreadable, when the truth was that our validator never answered.
   * The recovery is different too — a service blip needs "try again" on the
   * same photograph, not a retake.
   */
  const [serviceError, setServiceError] = React.useState<string | null>(null);
  const [validating, setValidating] = React.useState(false);
  /** Latest local signals, sent alongside the image so the server can weigh them. */
  const signalsRef = React.useRef<QualitySignals | null>(null);
  /** Where the image under review came from, so a retry re-runs it identically. */
  const sourceRef = React.useRef<"camera" | "upload">("camera");
  /*
   * When the card was first continuously detected.
   *
   * Auto-capture is not considered until CAPTURE_SETTLE_MS after this, so
   * somebody presenting a card gets a moment to line it up rather than having
   * the shutter fire on the way in — which is exactly how a smeared,
   * mid-motion photograph was being taken.
   */
  const detectedSinceRef = React.useRef<number | null>(null);
  /** 0–1 through the hold-still countdown, for the on-screen indicator. */
  const [holdProgress, setHoldProgress] = React.useState(0);
  /*
   * The border's colour tier, held ONLY in a ref.
   *
   * It is read by the canvas render loop, which runs outside React on every
   * animation frame, so mirroring it into state bought nothing and cost a
   * re-render several times a second. Now that the readability meter and
   * distance gauge are gone, no rendered element depends on it at all.
   */
  const tierRef = React.useRef<FrameTier>("poor");
  /** What the assistant last said, and when — the throttle for voice guidance. */
  const lastSpokenRef = React.useRef<string | null>(null);
  const lastSpokeAtRef = React.useRef(0);

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
    tierRef.current = "poor";
    detectedSinceRef.current = null;
    setHoldProgress(0);
    setStalled(false);
    lastAnalysisRef.current = 0;
    lastSpokenRef.current = null;
    lastSpokeAtRef.current = 0;
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

  /*
   * The single gate. Every image — auto-captured, manually shot, or chosen
   * from the gallery — goes through this before the preview will offer to use
   * it. One code path, one endpoint, one set of thresholds.
   */
  async function runValidation(blob: Blob, source: "camera" | "upload") {
    sourceRef.current = source;
    setValidating(true);
    setVerdict(null);
    setServiceError(null);

    const form = new FormData();
    form.append("image", blob, "cnic.jpg");
    form.append("side", side);
    /*
     * Local pixel signals belong to a CAMERA capture and to nothing else.
     *
     * They are measured from the live frame the shutter fired on. An uploaded
     * file has no such frame — and the ref still holds whatever the camera
     * last saw, which was very likely a poor frame, since a poor frame is why
     * somebody reaches for the gallery in the first place. Sending those along
     * scored a pristine uploaded photograph against the statistics of a bad
     * webcam frame and rejected it with a camera instruction: "Move the CNIC
     * closer to the camera", on a file upload.
     *
     * The server already handles absent signals correctly, scoring on the
     * model's own confidence. So an upload sends none, full stop.
     */
    if (source === "camera" && signalsRef.current) {
      form.append("signals", JSON.stringify(signalsRef.current));
    }

    try {
      const response = await fetch("/api/cnic/validate", { method: "POST", body: form });
      const payload = await response.json();

      if (!payload.success) {
        /*
         * The check did not happen. That is OUR failure, not a fault in the
         * photograph, and it must never be reported as one — the image is
         * still not accepted (no verdict means no way forward), but the
         * citizen is told the truth and offered a retry on the same picture.
         */
        setServiceError(payload.message ?? t.errors.unexpected);
        return;
      }

      setVerdict(payload.data);
    } catch {
      setServiceError(t.errors.network);
    } finally {
      setValidating(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    captureInFlightRef.current = true;
    setBusy(true);
    try {
      /*
       * Upload the CARD, not the whole frame.
       *
       * The guide is drawn on the display canvas, so the crop has to be mapped
       * back through the same cover-crop into source-video pixels — the
       * geometry lives in lib/cnic-capture-crop.ts where it can be tested.
       *
       * This matters most for the back: spending the whole resolution budget
       * on the card instead of on the desk around it is what makes the small
       * Urdu address print legible to the model at all.
       */
      const displayCanvas = canvasRef.current;
      const display = {
        width: displayCanvas?.width ?? video.videoWidth,
        height: displayCanvas?.height ?? video.videoHeight,
      };
      const crop = captureCropFor(
        guideRectFor(display.width, display.height),
        display,
        { width: video.videoWidth, height: video.videoHeight },
      );

      const canvas = document.createElement("canvas");
      canvas.width = crop.w;
      canvas.height = crop.h;
      canvas
        .getContext("2d")
        ?.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      const raw = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95),
      );
      if (!raw) throw new Error("capture failed");

      const prepared = await prepareCnicImage(raw);
      stopCamera();
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
      await runValidation(prepared.blob, "camera");
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
           * The live frame is scored on the SAME axes the server uses, through
           * the shared signal mapping. Previously this loop had its own private
           * notion of "ready" — a set of deliberately permissive pass/fail
           * checks — and nothing ever reconciled it with what the model would
           * later think of the photograph. A frame is now only "ready" when it
           * clears the same numeric bar the captured image will have to clear.
           */
          const signals = qualitySignalsFrom(result);
          signalsRef.current = signals;
          const screen = preScreen(signals);

          /*
           * ONE decision, and the score makes it.
           *
           * This used to require `result.ready` as well — every one of the
           * analyser's pass/fail checks, tilt included. That double-counted:
           * tilt, lighting and glare are ALREADY graded into the score through
           * the perspective, lighting and glareFree signals, so a card the
           * score rated 80 could still be held back by a binary tilt check
           * that had failed on the same frame. The visible symptom was a GREEN
           * border with the shutter refusing to fire and the caption reading
           * "Please straighten the CNIC" — the interface disagreeing with
           * itself, and the citizen left pressing the button by hand.
           *
           * Only one structural fact is now disqualifying on its own: no card
           * in the picture. Everything else is a matter of degree, and degrees
           * are what the score is for.
           */
          const frameReady = result.checks.detected && screen.tier === "green";

          const next: CaptureStatus = frameReady
            ? statusRef.current === "capturing"
              ? "capturing"
              : "ready"
            : result.checks.detected
              ? "need_adjustment"
              : "not_detected";

          if (next !== statusRef.current) {
            statusRef.current = next;
            setStatus(next);
          }

          if (result.issue !== issueRef.current) {
            issueRef.current = result.issue;
            setIssue(result.issue);
          }

          /*
           * The meter, the gauge and the border all come from this one result.
           * tierRef is what the border reads (it repaints every animation
           * frame, outside React); the state below is what the DOM reads.
           */
          /*
           * The border follows `frameReady`, not the score on its own, so it
           * physically cannot show green while the shutter is being held.
           */
          tierRef.current = frameReady
            ? "acceptable"
            : screen.tier === "red"
              ? "poor"
              : "improving";

          if (SHOW_DEBUG) setDebug(result);

          // The settle clock starts when a card first appears and resets the
          // moment it leaves, so it measures presence, not time on screen.
          if (result.checks.detected) {
            detectedSinceRef.current ??= Date.now();
          } else {
            detectedSinceRef.current = null;
          }

          const settledMs = detectedSinceRef.current
            ? Date.now() - detectedSinceRef.current
            : 0;
          const settled = settledMs >= CAPTURE_SETTLE_MS;

          /*
           * Progress through the hold, shown on screen so the capture is never
           * a surprise. Somebody who can see the ring filling knows to keep
           * still; somebody who cannot has no idea the photo is imminent.
           */
          setHoldProgress(
            frameReady && settled
              ? Math.min(1, streakRef.current / STABLE_FRAMES_REQUIRED)
              : 0,
          );

          if (frameReady) {
            streakRef.current += 1;
            if (
              settled &&
              streakRef.current >= STABLE_FRAMES_REQUIRED &&
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
            /*
             * A bad frame DECAYS the hold; it does not erase it.
             *
             * Resetting to zero was unreachable in practice. A hand-held card
             * flickers below the bar for a single frame all the time — a
             * blink of autofocus, a breath, one compressed video frame — and
             * with a hard reset every one of those restarted the whole
             * 1.8-second run, so the count never finished and the shutter
             * never fired however steady the person was being.
             *
             * Decaying by two costs more than a good frame earns, so genuine
             * instability still drives the count down to nothing quickly,
             * while an isolated blip only sets it back a fraction.
             */
            streakRef.current = Math.max(0, streakRef.current - 2);

            // Quality slipped mid-hold: stand the capture down and go back to
            // guiding, rather than taking the photo we already promised.
            if (captureTimeoutRef.current !== null) {
              window.clearTimeout(captureTimeoutRef.current);
              captureTimeoutRef.current = null;
              if (statusRef.current === "capturing") {
                statusRef.current = "ready";
                setStatus("ready");
              }
            }
          }
        }
      }

      const displayGuide = guideRectFor(canvas.width, canvas.height);
      /*
       * "capturing" means the shutter is already armed on a frame that was
       * green — holding the border green through the pre-capture pause avoids
       * a flicker back to orange on the last analysis tick before the photo.
       */
      drawGuide(
        ctx,
        displayGuide,
        statusRef.current === "capturing" ? "acceptable" : tierRef.current,
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

  /*
   * The stall timer.
   *
   * Runs only while the camera is actually live and no photo has been taken —
   * it must never fire behind the preview, where the citizen already has their
   * image and an offer to upload a different one would be nonsense.
   */
  React.useEffect(() => {
    if (cameraState !== "live" || preview) return;

    const timer = window.setTimeout(() => setStalled(true), STALL_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [cameraState, preview]);

  /*
   * Voice guidance during capture.
   *
   * Assistive, not narrative: it speaks only when the situation genuinely
   * CHANGES, never more than once every few seconds, and only while the
   * citizen has voice guidance switched on. Every phrase is a fixed
   * instruction from the dictionary — no value read off the card is ever
   * spoken, so a CNIC number cannot be announced across a crowded room.
   */
  React.useEffect(() => {
    if (!voiceEnabled || !voiceSupported) return;
    if (cameraState !== "live" || preview) return;

    const phrase =
      status === "ready" || status === "capturing"
        ? t.voice.capture.ready
        : status === "detecting"
          ? t.voice.capture.searching
          : issue
            ? t.voice.capture[issue]
            : null;

    if (!phrase || phrase === lastSpokenRef.current) return;

    const now = Date.now();
    if (now - lastSpokeAtRef.current < VOICE_MIN_INTERVAL_MS) return;

    lastSpokenRef.current = phrase;
    lastSpokeAtRef.current = now;
    speak(phrase);
  }, [voiceEnabled, voiceSupported, cameraState, preview, status, issue, speak]);

  function toggleVoice() {
    if (voiceEnabled) stopSpeaking();
    setVoiceEnabled(!voiceEnabled);
    // A fresh decision deserves a fresh phrase rather than a throttled silence.
    lastSpokenRef.current = null;
    lastSpokeAtRef.current = 0;
  }

  function cancelScanner() {
    stopSpeaking();
    stopCamera();
  }

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
      const prepared = await prepareCnicUpload(file);
      stopCamera();
      setPreview({ blob: prepared.blob, dataUrl: prepared.dataUrl });
      /*
       * A gallery image runs the SAME validation as a camera capture. The
       * previous behaviour ran none at all on this path, which is why uploads
       * behaved differently from the camera for no defensible reason.
       */
      await runValidation(prepared.blob, "upload");
    } catch {
      setError("We couldn't read that image. Please try another photo.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * The hidden file input, mounted by EVERY branch below.
   *
   * It used to be rendered only in the idle branch. The preview and the
   * full-screen scanner both `return` before that markup, so while either was
   * on screen the input did not exist — `fileInputRef.current` was null and
   * every "Upload CNIC" button in those branches did precisely nothing when
   * pressed. Nothing threw and nothing logged; the click was simply swallowed,
   * which is why it looked like the button was dead.
   *
   * `capture="environment"` asks a phone for its rear camera but is ignored by
   * desktop browsers, which show the normal file picker — so one input serves
   * both "take a photo" and "choose from gallery".
   */
  const fileInput = (
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
  );

  // -- Preview: confirm or retake -------------------------------------------
  if (preview) {
    return (
      <ScannerShell title={title} onCancel={() => setPreview(null)}>
        {fileInput}
        <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.dataUrl}
            alt={previewAlt}
            className="max-h-full w-full rounded-[20px] object-contain"
          />
        </div>

        <footer className="bg-black px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {/*
            The verdict on THIS photograph, not on the frame that triggered the
            shutter. Until it comes back READABLE there is no way forward from
            this screen — which is the entire fix.
          */}
          {validating ? (
            <div
              className="mb-3 flex items-center gap-2.5 rounded-[14px] bg-white/10 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-white" aria-hidden="true" />
              <p className="text-[0.8125rem] font-medium text-white">
                Checking the picture is readable…
              </p>
            </div>
          ) : serviceError ? (
            <div
              className="mb-3 rounded-[14px] border border-white/25 bg-white/10 px-4 py-3"
              role="alert"
            >
              <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-white">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                We couldn&rsquo;t check this picture
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-white/75">
                {serviceError} There is nothing wrong with your photo — this is our
                connection, not your CNIC.
              </p>
            </div>
          ) : verdict && verdict.state !== "READABLE" ? (
            <div
              className="mb-3 rounded-[14px] border border-[#e8615c]/40 bg-[#e8615c]/15 px-4 py-3"
              role="alert"
            >
              <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-white">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {verdict.state === "NOT_A_CNIC"
                  ? "That doesn't look like a CNIC"
                  : "Picture is not readable"}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-white/80">
                {verdict.instruction || "Please retake the picture."}
              </p>

              {/*
                Naming the fields that failed turns a refusal into instructions.
                "Not readable" alone leaves somebody retaking the same photo.
              */}
              {verdict.unreadableFields.length > 0 ? (
                <p className="mt-1.5 text-[0.75rem] text-white/60">
                  Could not read: {verdict.unreadableFields.join(", ")}
                </p>
              ) : null}

              {verdict.observedSide && verdict.observedSide !== side ? (
                <p className="mt-1.5 text-[0.75rem] font-medium text-white/80">
                  This looks like the {verdict.observedSide} of the card. Please show the{" "}
                  {side}.
                </p>
              ) : null}
            </div>
          ) : verdict?.state === "READABLE" ? (
            <div className="mb-3 flex items-center gap-2.5 rounded-[14px] bg-[#35c896]/15 px-4 py-3">
              <ShieldCheck className="size-4 shrink-0 text-[#8fe8c9]" aria-hidden="true" />
              <p className="text-[0.8125rem] font-medium text-white">
                Readable — quality {verdict.score}%.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              variant="secondary"
              size="full"
              onClick={() => {
                // Straight back to the viewfinder rather than out to the card
                // screen — a retake is a continuation, not a restart.
                setPreview(null);
                setVerdict(null);
                void startCamera();
              }}
              disabled={disabled}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t.identity.retake}
            </Button>

            {/*
              Only offered once the image has actually passed. There is no
              "continue anyway": an unreadable card cannot be made readable by
              insisting, and letting it through is how a wrong digit reaches
              somebody's identity record.
            */}
            {verdict?.state === "READABLE" ? (
              <Button size="full" onClick={() => onCaptured(preview)} disabled={disabled}>
                {t.identity.usePhoto}
              </Button>
            ) : serviceError ? (
              <Button
                size="full"
                onClick={() => void runValidation(preview.blob, sourceRef.current)}
                disabled={disabled || validating}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Check again
              </Button>
            ) : (
              <Button
                size="full"
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
                disabled={disabled || validating}
              >
                <ImageUp className="size-4" aria-hidden="true" />
                {uploadLabel}
              </Button>
            )}
          </div>
        </footer>
      </ScannerShell>
    );
  }

  // -- Live camera: the full-screen scanner ---------------------------------
  if (cameraState === "live" || cameraState === "starting") {
    /*
     * Everything below reads from `status`, `tier` and `readability`, all of
     * which come from one analysis result. The border colour, the percentage,
     * the border and the instruction can no longer contradict each other,
     * because they are no longer independent derivations of "is this frame
     * good" — a stale "CNIC is too far" over a green border was exactly that
     * bug.
     */
    const ready = status === "ready" || status === "capturing";

    // Exactly one message at a time: a short neutral line until the first
    // analysis lands, then whichever single issue matters most, then the
    // hold-still cue.
    const instruction =
      cameraState === "starting"
        ? t.identity.cameraStarting
        : status === "detecting"
          ? t.identity.autoCapture.detecting
          : ready
            ? t.identity.autoCapture.statusPerfect
            : issue
              ? t.identity.autoCapture.issues[issue]
              : t.identity.autoCapture.detecting;

    const live = cameraState === "live";

    return (
      <ScannerShell title={title} onCancel={cancelScanner}>
        {fileInput}
        {/*
          One instruction, in the same place every time. The reference banking
          flow puts this directly under the title bar rather than floating it
          over the card, where it competes with the thing the citizen is
          trying to look at.
        */}
        <p
          className="px-6 py-3 text-center text-[0.9375rem] font-medium text-white"
          aria-live="polite"
        >
          {instruction}
        </p>

        <div className="relative min-h-[46vh] flex-1 overflow-hidden sm:min-h-[52vh]">
          {/* The real frame source. Kept in normal layout (not display:none) so
              mobile browsers keep decoding it, but never shown directly — the
              canvas below draws the composited, annotated frame instead. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />

          {/* The bitmap is sized to this box and the cover-crop is done when
              drawing, so the guide can never be cropped off the sides. */}
          <canvas ref={canvasRef} className="h-full w-full" />

          {/*
            The hold-still countdown.
            
            Shown only once the frame is genuinely good and the settle period
            has passed, so it appears exactly when the shutter is about to
            arm — the visible warning that the previous behaviour lacked
            entirely, which is why capture felt sudden and caught the card
            mid-movement.
          */}
          {holdProgress > 0 ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
              role="status"
              aria-live="polite"
            >
              <span className="flex items-center gap-2.5 rounded-full bg-black/70 px-4 py-2 backdrop-blur">
                <span
                  aria-hidden="true"
                  className="relative block size-4 rounded-full border-2 border-white/30"
                >
                  <span
                    className="absolute inset-0 rounded-full border-2 border-[#35c896] transition-[clip-path] duration-150"
                    style={{
                      // Fills clockwise as the hold completes.
                      clipPath: `inset(${(1 - holdProgress) * 100}% 0 0 0)`,
                    }}
                  />
                </span>
                <span className="text-[0.8125rem] font-semibold text-white">
                  Hold still — capturing…
                </span>
              </span>
            </div>
          ) : null}

        </div>

        <footer className="bg-black px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {/*
            The scanner deliberately shows the card and ONE instruction, and
            nothing else. It used to carry a live readability percentage and a
            distance gauge beside the frame; both were accurate and both were
            noise. A citizen holding a card up to a camera is looking at the
            card, and a number counting toward a threshold invites them to
            optimise a figure rather than just position the card the way the
            frame is already showing them. The border colour and the single
            line above the frame carry the same information without asking
            anyone to read a dashboard.
          */}
          {/*
            Development diagnostics, collapsed to a single line.
            
            This used to render a full pass/fail table that took most of the
            screen, squeezing the viewfinder into a letterbox strip — with the
            result that there was nowhere left to actually put the card. The
            detail is still available, behind a disclosure, for the one person
            who needs it.
          */}
          {SHOW_DEBUG && debug ? (
            <details className="mb-3 rounded-[12px] bg-white/10 px-3 py-1.5">
              <summary className="cursor-pointer text-[0.6875rem] font-medium text-white/60">
                Debug · score {preScreen(qualitySignalsFrom(debug)).score} ·{" "}
                {debug.issue ?? "ok"}
              </summary>
              <div className="mt-2 rounded-[10px] bg-white p-1">
                <FrameDebugPanel result={debug} status={status} />
              </div>
            </details>
          ) : null}

          {/*
            The way out, offered by the scanner itself once auto-capture has
            plainly not been able to lock on. A laptop webcam that cannot
            resolve the card, or a card that will not fit the frame, is not
            something a citizen can fix by holding it differently for longer.
          */}
          {stalled ? (
            <div className="mb-4 rounded-[16px] border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-[0.8125rem] font-semibold text-white">
                {t.identity.autoCapture.stalledTitle}
              </p>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-white/75">
                {t.identity.autoCapture.stalledBody}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2.5 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-field)] bg-white px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-white/90"
              >
                <ImageUp className="size-4" aria-hidden="true" />
                {uploadLabel}
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            {voiceSupported ? (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={voiceEnabled}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-[var(--radius-field)] border border-white/25 px-4 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-white/10"
              >
                {voiceEnabled ? (
                  <Volume2 className="size-4" aria-hidden="true" />
                ) : (
                  <VolumeX className="size-4" aria-hidden="true" />
                )}
                <span className="sr-only sm:not-sr-only">
                  {voiceEnabled
                    ? t.identity.autoCapture.voiceOn
                    : t.identity.autoCapture.voiceOff}
                </span>
              </button>
            ) : null}

            {/*
              Manual capture is always available, at any readability. Auto-
              capture is a convenience; a citizen who judges their own photo
              good enough is not overruled by a heuristic.
            */}
            <Button
              size="full"
              onClick={capture}
              loading={busy}
              disabled={!live || disabled || status === "capturing"}
            >
              {!busy ? <Camera className="size-4" aria-hidden="true" /> : null}
              {t.identity.capture}
            </Button>
          </div>
        </footer>
      </ScannerShell>
    );
  }

  // -- Idle / denied / unavailable ------------------------------------------
  return (
    <div className="space-y-4">
      {fileInput}

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
          {scanLabel}
        </Button>

        <Button
          variant="secondary"
          size="full"
          onClick={() => fileInputRef.current?.click()}
          loading={busy}
          disabled={disabled}
        >
          {!busy ? <ImageUp className="size-4" aria-hidden="true" /> : null}
          {uploadLabel}
        </Button>
      </div>

    </div>
  );
}

/*
 * The full-screen scanner chrome: a branded top bar with a way out, and the
 * viewfinder below it.
 *
 * Taking over the whole screen is the point. A document scanner shown inside a
 * page card competes with the page's own scrolling and chrome, and leaves the
 * frame too small to aim with on a phone; every banking e-KYC flow this is
 * modelled on goes full-bleed for exactly that reason. It is a modal dialog,
 * and it is labelled as one, so a screen reader announces which side of the
 * card is being asked for.
 */
function ScannerShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <header className="flex items-center gap-2 bg-civic-600 px-2 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-medium transition-colors hover:bg-white/15"
        >
          <X className="size-4" aria-hidden="true" />
          {t.identity.cancel}
        </button>

        <h2 className="flex-1 text-center text-[0.9375rem] font-semibold">{title}</h2>

        {/* Balances the cancel control so the title sits truly centred. */}
        <span className="w-[5.5rem] shrink-0" aria-hidden="true" />
      </header>

      {children}
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
