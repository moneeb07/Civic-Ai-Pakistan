import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import {
  analyzeReportImage,
  patchReport,
  uploadReportImage,
  type UploadFile,
} from "@/api/client";
import { CATEGORY_LABELS, CIVIC_CATEGORIES, type CivicCategory, type VisionResult } from "@/report/types";
import { ReportShell, ReportStepHeading } from "@/report/shell";
import { Button, ErrorNote } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Step one: a photo, then AI classification.
 *
 * Deliberately a plain point-and-shoot — not the CNIC screen's auto-capture
 * guide box. The web's own brief is explicit about why: a citizen photographing
 * a pothole or a burst pipe should not have to fit an unpredictable, irregular
 * problem into an artificial rectangle. A manual shutter (via the system
 * camera) is the right tool here, the auto-capture frame is not.
 *
 * State machine mirrors the web exactly: capture -> analyzing -> confirm (AI
 * found something, citizen says yes/no) | choose-category (AI found nothing,
 * or isn't configured). Nothing the AI says is ever auto-accepted.
 */
type Phase = "capture" | "analyzing" | "confirm" | "choose-category";

export default function ReportCameraStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = React.useState<Phase>("capture");
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);
  const [vision, setVision] = React.useState<VisionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function pick(source: "camera" | "library") {
    setError(null);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "CivicAI needs the camera to photograph the problem."
            : "CivicAI needs access to your photos.",
        );
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      await analyze(uri);
    } catch {
      setError("That photo could not be read. Please try again.");
    }
  }

  async function analyze(uri: string) {
    setPhase("analyzing");
    setError(null);

    try {
      const file: UploadFile = { uri, name: "report.jpg", type: "image/jpeg" };
      await uploadReportImage(id, file);
      const result = await analyzeReportImage(id);

      if (!result.vision.readable) {
        setError("That photo looks unclear. Please try again with more light or a steadier hand.");
        setPhase("capture");
        return;
      }

      if (result.vision.detected) {
        setVision(result.vision);
        setPhase("confirm");
      } else {
        setPhase("choose-category");
      }
    } catch (caught) {
      /*
       * "not_configured" means automatic detection simply isn't available —
       * that is CivicAI's gap, not a fault in the photo, so the citizen goes
       * straight to picking a category by hand rather than seeing an error
       * about a photo that was perfectly fine.
       */
      const reason = caught instanceof Error && "reason" in caught ? (caught as { reason?: string }).reason : undefined;
      if (reason === "not_configured") {
        setPhase("choose-category");
        return;
      }
      setError(caught instanceof Error ? caught.message : "We couldn't analyse that photo.");
      setPhase("capture");
    }
  }

  async function confirmCategory(category: CivicCategory) {
    setBusy(true);
    try {
      await patchReport(id, { category, visionConfirmed: true });
      router.push(`/report/new/${id}/describe`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPhotoUri(null);
    setVision(null);
    setError(null);
    setPhase("capture");
  }

  if (phase === "analyzing") {
    return (
      <ReportShell step="camera">
        <View style={styles.centre}>
          <ActivityIndicator color={colors.civic600} size="large" />
          <Ionicons name="scan" size={20} color={colors.civic600} style={{ marginTop: spacing.lg }} />
          <Text style={styles.centreTitle}>Looking at your photo…</Text>
        </View>
      </ReportShell>
    );
  }

  if (phase === "confirm" && vision) {
    return (
      <ReportShell step="camera">
        <ReportStepHeading title="Is this what you're reporting?" />
        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.detectCard}>
          <Text style={styles.detectLabel}>Possible</Text>
          <Text style={styles.detectCategory}>
            {vision.category ? CATEGORY_LABELS[vision.category] : "Civic issue"}
          </Text>
          {vision.evidence.length > 0 ? (
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {vision.evidence.map((line, i) => (
                <Text key={i} style={styles.evidenceLine}>
                  · {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button
            label="Yes, that's the problem"
            busy={busy}
            onPress={() => vision.category && confirmCategory(vision.category)}
          />
          <Button label="No, try again" variant="quiet" onPress={retake} />
        </View>
      </ReportShell>
    );
  }

  if (phase === "choose-category") {
    return (
      <ReportShell step="camera">
        <ReportStepHeading
          title="What's the problem?"
          subtitle="Pick the closest match."
        />
        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.categoryGrid}>
          {CIVIC_CATEGORIES.map((category) => (
            <Pressable
              key={category}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => confirmCategory(category)}
              style={({ pressed }) => [styles.categoryChip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.categoryChipText}>{CATEGORY_LABELS[category]}</Text>
            </Pressable>
          ))}
        </View>
      </ReportShell>
    );
  }

  // -- capture --------------------------------------------------------------
  return (
    <ReportShell step="camera">
      <ReportStepHeading
        title="Photograph the problem"
        subtitle="A clear, well-lit photo helps the department act faster."
      />
      {error ? <ErrorNote message={error} /> : null}

      {photoUri ? null : (
        <View style={styles.placeholder}>
          <Ionicons name="camera-outline" size={40} color={colors.civic200} />
        </View>
      )}

      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        <Button label="Take a photo" onPress={() => pick("camera")} />
        <Button label="Choose from gallery" variant="quiet" onPress={() => pick("library")} />
      </View>
    </ReportShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl * 4 },
  centreTitle: { marginTop: spacing.lg, fontSize: 16, fontWeight: "700", color: colors.ink },
  placeholder: {
    height: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.lineStrong,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  detectCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#fdf6ea",
    borderWidth: 1,
    borderColor: "#f3dfa8",
  },
  detectLabel: { fontSize: 11, fontWeight: "700", color: "#c2790a", letterSpacing: 0.4 },
  detectCategory: { marginTop: 4, fontSize: 19, fontWeight: "800", color: colors.ink },
  evidenceLine: { fontSize: 13, lineHeight: 19, color: colors.muted },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryChip: {
    width: "48%",
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  categoryChipText: { fontSize: 13, fontWeight: "600", color: colors.ink, textAlign: "center" },
});
