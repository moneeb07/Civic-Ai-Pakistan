import * as React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";

import { CardOverlay } from "./card-overlay";
import { useCardDetector } from "./detect-card";
import { Button } from "@/components/ui";
import { colors, spacing } from "@/theme";

/*
 * The CNIC camera: a guided viewfinder with a MANUAL shutter.
 *
 * It used to fire by itself once the card looked aligned and still for three
 * seconds. That is gone, and the reason is worth recording, because the
 * machinery it drove is still here.
 *
 * Auto-capture decides FOR the citizen, at the one moment they most need the
 * decision: they are still squaring up the card, the detector calls it good,
 * and the photograph is taken. There was no way to say "not yet" — and no way
 * to say "yes, now" either, so someone whose card the detector could not read
 * (dark room, patterned table, a laminated card throwing glare) was left
 * pointing a camera that would never fire. Both failures produced the same
 * thing: a retake.
 *
 * So the detector stays and keeps advising — the box turns green, the hint
 * says what is wrong — but pressing the shutter is the citizen's. The button
 * is never disabled, deliberately: the detector is a guide, not an authority,
 * and it is wrong often enough that gating on it would strand people holding
 * a perfectly readable card.
 *
 * All of the detection runs on-device. No frame is uploaded to decide anything
 * — only the single photograph the citizen chooses to take is sent, and that
 * goes to CivicAI's own extraction endpoint.
 */

// Loosened alongside detect-card.ts's thresholds — see the note there. Two
// confirming frames commits to the countdown a beat sooner than three.
const CARD_PRESENT_FRAMES = 2;

// Max average per-sample brightness change between frames still considered
// "held still". While the card is being moved into place this runs high, and
// counting those frames is what caused captures to fire mid-movement.
// Raised from 14: ordinary hand tremor holding a phone up reads higher than a
// device braced on a desk, and at 14 that tremor alone was enough to keep
// resetting the "steady" streak — which is a large part of what "rigid" meant
// in practice, since the countdown could never get past "Hold still…".
const MOTION_THRESHOLD = 22;

// How many consecutive bad frames are tolerated before progress is thrown
// away. Without this the countdown restarts on a single frame that dips out
// of alignment, which normal hand-shake does constantly — the timer then
// only ever advances while the card is held unnaturally rigid. At ~30fps
// this rides out roughly a third of a second of wobble.
const GRACE_FRAMES = 10;

/*
 * A note on cropping.
 *
 * The reference project cropped the captured JPEG down to the guide box before
 * using it, via expo-image-manipulator. That package cannot be installed here:
 * it ships no config plugin and declares its TypeScript source as its entry
 * point, so Expo's autolinking tries to require a .ts file and Node refuses,
 * which stops the dev server before it starts.
 *
 * The whole photograph is sent instead. The ROI still does its real work —
 * it drives the overlay and the detector, so the citizen has framed the card
 * inside the box and it dominates the image — and CivicAI's extraction
 * endpoint reads the card out of the full frame, exactly as it does for the
 * web app, which uploads whole webcam frames too.
 */

export interface AutoCameraProps {
  /** Which side of the card is being asked for — changes only the wording. */
  side: "front" | "back";
  /** Handed the cropped JPEG's file URI once a capture is accepted. */
  onCaptured: (uri: string) => void;
  /** Rendered when the camera cannot be used at all. */
  onUnavailable: (reason: string) => void;
  /** A close button on the live view. Omitted, none is shown. */
  onCancel?: () => void;
}

export default function AutoCamera({ side, onCaptured, onUnavailable, onCancel }: AutoCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = React.useRef<Camera>(null);
  const detect = useCardDetector();
  const insets = useSafeAreaInsets();

  const [aligned, setAligned] = React.useState(false);
  const [hint, setHint] = React.useState("Align the card…");
  const [busy, setBusy] = React.useState(false);
  const [denied, setDenied] = React.useState(false);

  const presentCount = React.useRef(0); // consecutive frames a card has been seen
  const missCount = React.useRef(0); // consecutive bad frames, for the grace period
  const lockRef = React.useRef(false); // prevents re-entrant captures
  const prevSig = React.useRef<number[] | null>(null);

  React.useEffect(() => {
    if (hasPermission) return;
    void requestPermission().then((granted) => {
      if (!granted) setDenied(true);
    });
  }, [hasPermission, requestPermission]);

  const doCapture = React.useCallback(async () => {
    if (lockRef.current || !camera.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      const photo = await camera.current.takePhoto({ flash: "off" });
      // Android reports a bare filesystem path; everything downstream needs a URI.
      const uri =
        Platform.OS === "android" && !photo.path.startsWith("file://")
          ? `file://${photo.path}`
          : photo.path;
      onCaptured(uri);
    } catch {
      lockRef.current = false; // allow retry on failure
      setHint("Capture failed — try again");
    } finally {
      setBusy(false);
    }
  }, [onCaptured]);

  // Bridge from the frame-processor (native) thread back to JS state.
  const onResult = useRunOnJS(
    (res: ReturnType<ReturnType<typeof useCardDetector>>) => {
      if (lockRef.current) return;

      // How much did the interior change since the last frame? While the card
      // is still being positioned this is high, and those frames must not
      // count toward the stable streak or the shutter fires mid-movement.
      let motion = 999;
      if (prevSig.current && res.sig) {
        let s = 0;
        for (let i = 0; i < res.sig.length; i++) {
          s += Math.abs(res.sig[i] - prevSig.current[i]);
        }
        motion = s / res.sig.length;
      }
      prevSig.current = res.sig ?? null;
      const steady = motion < MOTION_THRESHOLD;

      /* ---- A bad frame — but don't necessarily throw progress away. ----
       * Hands shake. Demanding an unbroken run of perfect frames means the
       * countdown restarts constantly and only advances while the card is
       * held unnaturally rigid. So once there is progress worth keeping,
       * ride out a short run of bad frames: the countdown keeps running and
       * the pill is left alone rather than flickering between messages.
       */
      if (!res.aligned || !steady) {
        missCount.current += 1;
        const hasProgress = presentCount.current > 0;
        if (hasProgress && missCount.current <= GRACE_FRAMES) return;

        presentCount.current = 0;

        if (res.aligned) {
          // Card is there, just genuinely unsettled for longer than the grace
          // period — keep the box green and only ask for stillness.
          setAligned(true);
          setHint("Hold still…");
          return;
        }

        setAligned(false);
        // Guidance driven by whichever specific test failed, most actionable
        // first — telling someone to "hold steady" is useless if the real
        // problem is that the card is too far away.
        if (!res.litOk && res.brightness <= 70) setHint("Too dark — add more light");
        else if (!res.litOk) setHint("Too bright — reduce glare");
        else if (!res.sizeOk) setHint("Move the card closer");
        else if (!res.aspectOk) setHint("Show the whole card in the box");
        else if (!res.borderClear) setHint("Keep the card clear of the background");
        else if (!res.contrastOk) setHint("Move to a plainer background");
        else if (!res.flatEnough) setHint("Flatten the card, avoid tilt");
        else setHint("Align the card…");
        return;
      }

      // Good frame — the wobble budget resets.
      missCount.current = 0;
      setAligned(true);

      // ---- Stage 1: confirm a card is really there before committing. ----
      presentCount.current += 1;
      if (presentCount.current < CARD_PRESENT_FRAMES) {
        setHint("Checking card…");
        return;
      }

      /* ---- Stage 2: card confirmed. The citizen presses the shutter. ----
       *
       * This used to run a countdown and fire the shutter itself. It was
       * removed because it took the decision away at exactly the wrong moment:
       * the camera would commit to a frame while someone was still adjusting
       * the card, and there was no way to say "wait". Worse, it fired on
       * ITS OWN judgement of alignment — so a citizen who could see the photo
       * was going to be bad had to watch it happen anyway, then retake.
       *
       * The detector still runs, and everything it learned is still used: the
       * box turns green and the hint says the card is ready. It just advises
       * now instead of deciding. The shutter is a button.
       */
      setHint("Looks good — press the button");
    },
    [],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      const res = detect(frame);
      onResult(res);
    },
    [detect, onResult],
  );

  /*
   * No camera at all, or the citizen said no. Either way this screen cannot
   * do its job, so it hands back to the flow rather than sitting on a dead
   * viewfinder — the flow then offers typing the card in by hand, which is a
   * first-class path, not a consolation prize.
   */
  React.useEffect(() => {
    if (denied) onUnavailable("Camera permission was declined.");
  }, [denied, onUnavailable]);

  if (!hasPermission) {
    return (
      <View style={styles.centre}>
        <Text style={styles.message}>CivicAI needs the camera to scan your CNIC.</Text>
        <View style={{ marginTop: spacing.lg, alignSelf: "stretch" }}>
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        </View>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.white} />
        <Text style={styles.message}>Starting the camera…</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        frameProcessor={frameProcessor}
      />
      <CardOverlay
        aligned={aligned}
        hint={hint}
        title={side === "front" ? "Front of your CNIC" : "Back of your CNIC"}
      />
      {/*
        The standing instruction, above everything.

        Deliberately separate from the live hint below the box: that one
        changes constantly as the detector reacts, and a message that moves is
        a message nobody reads. This one never changes, so it can be relied on
        — it is the whole job of this screen in one line.
      */}
      <View style={[styles.instruction, { top: insets.top + spacing.xl * 2 }]}>
        <Text style={styles.instructionText}>Fit your CNIC inside the box</Text>
      </View>

      {/*
        The shutter. Always enabled, even when the detector is unhappy.

        Refusing to take the photograph would reintroduce the problem this
        change exists to fix: the detector is a guide, not an authority, and it
        is wrong often enough — poor light, a plain background it reads as no
        card — that locking the button would strand someone with a perfectly
        readable card and no way to proceed. The green box tells them when it
        thinks the shot is good; pressing anyway is their call.
      */}
      <View style={[styles.shutterBar, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Capture the ${side} of your CNIC`}
          onPress={() => void doCapture()}
          disabled={busy}
          style={({ pressed }) => [
            styles.shutter,
            aligned && styles.shutterReady,
            (pressed || busy) && { opacity: 0.6 },
          ]}
        >
          <View style={[styles.shutterInner, aligned && styles.shutterInnerReady]} />
        </Pressable>
      </View>

      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          hitSlop={10}
          style={[styles.close, { top: insets.top + spacing.md }]}
        >
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
      ) : null}
      {busy ? (
        <View style={styles.capturing}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.message}>Capturing…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#070c16" },
  centre: {
    flex: 1,
    backgroundColor: "#070c16",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  message: { color: "#E5E7EB", marginTop: spacing.md, fontSize: 15, textAlign: "center" },
  capturing: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  instruction: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  instructionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  shutterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Green once the detector is happy: an invitation, never a gate.
  shutterReady: { borderColor: colors.civic500 },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
  },
  shutterInnerReady: { backgroundColor: colors.civic500 },
  close: {
    position: "absolute",
    left: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,12,22,0.6)",
  },
});
