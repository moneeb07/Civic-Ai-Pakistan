import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import type { AutoCameraProps } from "./auto-camera";
import { colors, radius, spacing } from "@/theme";

/*
 * The CNIC camera the registration flow actually renders.
 *
 * Auto-capture needs Vision Camera's frame processors, which are NATIVE code.
 * They run in a development build and they do not run in Expo Go, which ships
 * a fixed set of native modules. Rather than make the whole signup unreachable
 * in Expo Go — the way the app is being run day to day right now — this picks
 * the best camera actually available:
 *
 *   development build → the auto-capture viewfinder, which finds the card and
 *                       fires the shutter itself
 *   Expo Go           → the system camera, with the citizen pressing the
 *                       button
 *
 * Both produce the same thing: a JPEG on disk, uploaded to the same endpoint.
 * The difference is only in how the photograph gets taken, so nothing about
 * what a valid registration is depends on which one ran.
 */

/*
 * JPEG quality for the manual camera. See the note where it is used: this is
 * the difference between a photograph that uploads in a second and one that
 * exceeds the server's 8MB ceiling.
 */
const CAPTURE_QUALITY = 0.6;

type AutoCameraComponent = React.ComponentType<AutoCameraProps>;

/*
 * Loaded with require(), not a static import, so that a missing native module
 * is a caught error rather than a blank red screen at startup.
 */
let AutoCamera: AutoCameraComponent | null = null;
let loadFailed = false;

try {
  AutoCamera = (require("./auto-camera") as { default: AutoCameraComponent }).default;
} catch {
  loadFailed = true;
}

/**
 * Whether auto-capture is available in this build.
 *
 * Exported so a developer bringing the app up can tell a deliberate fallback
 * from a broken install — the two look identical on screen otherwise, which is
 * exactly the confusion this caused.
 */
export const autoCaptureAvailable = !loadFailed && AutoCamera != null;

/*
 * Requiring the module can succeed while RENDERING it still fails, because
 * Vision Camera only reaches for its native side when the view mounts. This
 * boundary catches that and falls back, instead of taking the app down.
 */
class NativeCameraBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface CnicCaptureProps {
  side: "front" | "back";
  onCaptured: (uri: string) => void;
  /** Offered on the manual screen so nobody is trapped without a camera. */
  onSkip?: () => void;
  /**
   * A way out of a full-screen camera that isn't the manual "skip" path — a
   * change of mind, or a camera that has stopped responding. Rendered as a
   * small close button on the live view; without one, the only exit from a
   * frozen auto-capture screen was the OS back button, if that even mapped to
   * somewhere sane.
   */
  onCancel?: () => void;
}

export function CnicCapture({ side, onCaptured, onSkip, onCancel }: CnicCaptureProps) {
  const [forcedManual, setForcedManual] = React.useState(false);

  const manual = (
    <ManualCapture side={side} onCaptured={onCaptured} onSkip={onSkip} />
  );

  if (loadFailed || AutoCamera == null || forcedManual) return manual;

  return (
    <NativeCameraBoundary fallback={manual}>
      <AutoCamera
        side={side}
        onCaptured={onCaptured}
        onUnavailable={() => setForcedManual(true)}
        onCancel={onCancel}
      />
    </NativeCameraBoundary>
  );
}

/**
 * The system camera, driven by the citizen.
 *
 * Deliberately not dressed up to look like the auto-capture viewfinder: it
 * behaves differently, and pretending otherwise would leave someone waiting
 * for a shutter that is never going to fire on its own.
 */
function ManualCapture({
  side,
  onCaptured,
  onSkip,
}: {
  side: "front" | "back";
  onCaptured: (uri: string) => void;
  onSkip?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function open(source: "camera" | "library") {
    setBusy(true);
    setError(null);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "CivicAI needs the camera to photograph your CNIC."
            : "CivicAI needs access to your photos to pick an image.",
        );
        return;
      }

      /*
       * Quality matters more than it looks here. At 0.92 a modern phone
       * produces a five-to-nine megabyte JPEG, and pushing that up a weak
       * connection is what made the read appear to hang — the server caps the
       * upload at 8MB, so the largest of them were never going to arrive at
       * all. 0.6 is a fraction of the size and still far more detail than the
       * text on a CNIC needs to be read.
       */
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: CAPTURE_QUALITY })
          : await ImagePicker.launchImageLibraryAsync({ quality: CAPTURE_QUALITY });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      onCaptured(result.assets[0].uri);
    } catch {
      setError("That photograph could not be read. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.manual}>
      <View style={styles.cardIcon}>
        <Ionicons name="card-outline" size={30} color={colors.civic200} />
      </View>

      <Text style={styles.manualTitle}>
        {side === "front" ? "Photograph the FRONT of your CNIC" : "Now the BACK of your CNIC"}
      </Text>
      <Text style={styles.manualBody}>
        {side === "front"
          ? "The side with your photograph and CNIC number. Lay the card flat, fill the frame, and avoid glare."
          : "The side with your address. This is what fills in your address automatically."}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void open("camera")}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Ionicons name="camera" size={18} color={colors.civic900} />
        <Text style={styles.primaryText}>{busy ? "Opening…" : "Open camera"}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void open("library")}
        style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
      >
        <Text style={styles.ghostText}>Choose an existing photo</Text>
      </Pressable>

      {__DEV__ ? (
        <Text style={styles.devHint}>
          Auto-capture is unavailable in Expo Go. Run a development build
          (npx expo run:android) for the guided frame.
        </Text>
      ) : null}

      {onSkip ? (
        <Pressable accessibilityRole="button" onPress={onSkip} style={styles.skip}>
          <Text style={styles.skipText}>
            {side === "front" ? "Type my details instead" : "Skip — I'll type my address"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  manual: {
    flex: 1,
    backgroundColor: "#070c16",
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  manualTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.white,
    textAlign: "center",
  },
  manualBody: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  error: {
    marginTop: spacing.lg,
    fontSize: 13,
    color: "#fca5a5",
    textAlign: "center",
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.civic100,
  },
  primaryText: { fontSize: 16, fontWeight: "700", color: colors.civic900 },
  ghost: {
    alignSelf: "stretch",
    marginTop: spacing.md,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  ghostText: { fontSize: 15, fontWeight: "600", color: colors.white },
  pressed: { opacity: 0.75 },
  devHint: {
    marginTop: spacing.xl,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  skip: { marginTop: spacing.xl, padding: spacing.sm },
  skipText: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.75)" },
});
