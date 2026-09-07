import * as React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";

import { CardOverlay } from "./card-overlay";
import { Button } from "@/components/ui";
import { colors, spacing } from "@/theme";

/*
 * The CNIC camera: a viewfinder with a box and a shutter button. Nothing else.
 *
 * WHAT THIS SCREEN USED TO DO.
 * It ran a per-frame detector on the native thread — card presence, edge
 * aspect, size, background contrast, tilt, brightness, glare, plus a motion
 * signature compared frame to frame — accumulated a stability streak, and
 * fired the shutter by itself when it was satisfied.
 *
 * Two failures came out of that, and they were opposite ends of the same
 * mistake. The camera committed to a frame while the citizen was still
 * squaring up the card, with no way to say "wait"; and where the detector
 * could not see a card at all — a dim room, a patterned tablecloth, a
 * laminate throwing glare — it simply never fired, leaving someone pointing a
 * camera at a perfectly readable card and waiting. Both ended in a retake.
 *
 * The detector is gone rather than demoted. Its judgements were about pixels,
 * and the question that matters is whether the model can read the card, which
 * it does on photographs the detector graded badly. Keeping it as advice would
 * still have put a red box and a stream of corrections in front of somebody
 * whose photograph was going to work.
 *
 * So: the box shows where to put the card, the line above says so, and the
 * button takes the picture when the citizen decides. The photograph goes to
 * the extraction endpoint and whatever the model reads comes back as editable
 * fields, where the person holding the card checks it. That is the only check
 * this flow needs, and it is a far better one than any of the above.
 *
 * Nothing is uploaded except the single photograph the citizen chooses to
 * take, and that goes to CivicAI's own endpoint.
 */

/*
 * A note on cropping.
 *
 * The reference project cropped the captured JPEG down to the guide box before
 * using it, via expo-image-manipulator. That package cannot be installed here:
 * it ships no config plugin and declares its TypeScript source as its entry
 * point, so Expo's autolinking tries to require a .ts file and Node refuses,
 * which stops the dev server before it starts.
 *
 * The whole photograph is sent instead. The box still does its real work — the
 * citizen frames the card inside it, so the card dominates the image — and the
 * extraction endpoint reads the card out of the full frame, exactly as it does
 * for the web app, which uploads whole photographs too.
 */

export interface AutoCameraProps {
  /** Which side of the card is being asked for — changes only the wording. */
  side: "front" | "back";
  /** Handed the captured JPEG's file URI. */
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
  const insets = useSafeAreaInsets();

  const [busy, setBusy] = React.useState(false);
  const [denied, setDenied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const lockRef = React.useRef(false); // prevents re-entrant captures

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
    setError(null);
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
      setError("Capture failed — try again");
    } finally {
      setBusy(false);
    }
  }, [onCaptured]);

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
      />

      {/*
        The box is drawn in its ready colour permanently.

        It used to change with the detector's verdict, and that is precisely
        what made it unhelpful: a citizen holding a card the model would read
        without difficulty watched the box sit red and a hint tell them to move
        to a plainer background. It marks where to put the card. It is not a
        verdict on anything.
      */}
      <CardOverlay
        aligned
        hint={error ?? "Press the button when the card is inside the box"}
        title={side === "front" ? "Front of your CNIC" : "Back of your CNIC"}
      />

      {/* The standing instruction — the whole job of this screen in one line. */}
      <View style={[styles.instruction, { top: insets.top + spacing.xl * 2 }]}>
        <Text style={styles.instructionText}>Fit your CNIC inside the box</Text>
      </View>

      {/* The shutter. The only thing that decides when a photograph is taken. */}
      <View style={[styles.shutterBar, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Capture the ${side} of your CNIC`}
          onPress={() => void doCapture()}
          disabled={busy}
          style={({ pressed }) => [
            styles.shutter,
            (pressed || busy) && { opacity: 0.6 },
          ]}
        >
          <View style={styles.shutterInner} />
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
    borderColor: colors.civic500,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
  },
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
