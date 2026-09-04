import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type * as ExpoAvNS from "expo-av";

import { submitTextDescription, submitVoiceDescription, type UploadFile } from "@/api/client";
import { ReportShell, ReportStepHeading } from "@/report/shell";
import { Button, ErrorNote } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Step two: describe it, by voice or by typing.
 *
 * A genuinely separate recording path from the CNIC flow — there is no
 * shared code with expo-av here, because a description recording has no
 * frame to auto-detect against, just start, talk, stop.
 *
 * Whatever comes back — spoken or typed — is always shown back for the
 * citizen to correct before moving on, since speech recognition is never
 * perfect and a silently-accepted mishearing would ride all the way into
 * the AI-generated complaint.
 *
 * expo-av is loaded with require() inside a try/catch, not a static import.
 * A static `import { Audio } from "expo-av"` resolves the native module
 * eagerly, at module-evaluation time — so on a dev client built before this
 * package was added, the whole FILE throws before its own `export default`
 * is ever reached, which Expo Router then reports as the unrelated-looking
 * "missing default export". Deferring it here means the app works today
 * (typing only) and gains voice automatically the moment the client is
 * rebuilt — mirrors src/cnic/capture.tsx's AutoCamera fallback exactly.
 */
let Audio: typeof ExpoAvNS.Audio | null = null;
try {
  Audio = (require("expo-av") as typeof ExpoAvNS).Audio;
} catch {
  Audio = null;
}
const voiceAvailable = Audio !== null;

type Mode = "choose" | "voice" | "type" | "review";

const MAX_DURATION_MS = 90_000;

export default function ReportDescribeStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [mode, setMode] = React.useState<Mode>("choose");
  const [recording, setRecording] = React.useState<ExpoAvNS.Audio.Recording | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [transcript, setTranscript] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recording?.stopAndUnloadAsync().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    if (!Audio) {
      setError("Voice recording needs a rebuilt app — please type your description instead.");
      return;
    }
    setError(null);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError("CivicAI needs the microphone to record your description.");
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
      setMode("voice");
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS) void stopRecording(rec);
      }, 200);
    } catch {
      setError("Could not start recording. Please type your description instead.");
    }
  }

  async function stopRecording(target?: ExpoAvNS.Audio.Recording) {
    const rec = target ?? recording;
    if (!rec) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setBusy(true);
    setError(null);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);
      if (!uri) throw new Error("Recording could not be read.");

      const file: UploadFile = { uri, name: "description.m4a", type: "audio/mp4" };
      const result = await submitVoiceDescription(id, file);
      setTranscript(result.transcript ?? "");
      setMode("review");
    } catch (caught) {
      const reason =
        caught instanceof Error && "reason" in caught ? (caught as { reason?: string }).reason : undefined;
      if (reason === "unclear") {
        setError("We couldn't clearly understand that. Please try again, or type instead.");
      } else if (reason === "not_configured") {
        setError("Voice transcription isn't available right now. Please type your description.");
      } else {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      }
      setMode("choose");
    } finally {
      setBusy(false);
    }
  }

  async function submitTyped() {
    if (!transcript.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await submitTextDescription(id, transcript.trim());
      setMode("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndContinue() {
    setBusy(true);
    setError(null);
    try {
      // Authoritative even if unedited — whatever is in the box is what's kept.
      await submitTextDescription(id, transcript.trim());
      router.push(`/report/new/${id}/location`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "voice") {
    const seconds = Math.floor(elapsedMs / 1000);
    return (
      <ReportShell step="describe">
        <ReportStepHeading title="Recording…" subtitle="Describe what's wrong and where." />
        <View style={styles.recordingCentre}>
          <View style={styles.micHalo}>
            <Ionicons name="mic" size={34} color={colors.white} />
          </View>
          <Text style={styles.timer}>
            {String(Math.floor(seconds / 60)).padStart(1, "0")}:{String(seconds % 60).padStart(2, "0")}
          </Text>
          <View style={{ marginTop: spacing.xl, alignSelf: "stretch" }}>
            <Button label="Stop" busy={busy} onPress={() => stopRecording()} />
          </View>
        </View>
      </ReportShell>
    );
  }

  if (mode === "review") {
    return (
      <ReportShell step="describe">
        <ReportStepHeading title="What we heard" subtitle="Correct anything that's wrong before continuing." />
        {error ? <ErrorNote message={error} /> : null}

        <TextInput
          value={transcript}
          onChangeText={setTranscript}
          multiline
          style={styles.reviewInput}
          placeholder="Describe the problem…"
          placeholderTextColor={colors.muted}
        />

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button label="Correct" busy={busy} disabled={!transcript.trim()} onPress={confirmAndContinue} />
          <Button
            label="Record again"
            variant="quiet"
            onPress={() => {
              setTranscript("");
              setMode("choose");
            }}
          />
        </View>
      </ReportShell>
    );
  }

  if (mode === "type") {
    return (
      <ReportShell step="describe">
        <ReportStepHeading title="Describe the problem" />
        {error ? <ErrorNote message={error} /> : null}

        <TextInput
          value={transcript}
          onChangeText={setTranscript}
          multiline
          autoFocus
          style={styles.reviewInput}
          placeholder="e.g. Deep pothole in the middle of the road, cars are swerving to avoid it…"
          placeholderTextColor={colors.muted}
        />

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Continue" busy={busy} disabled={!transcript.trim()} onPress={submitTyped} />
        </View>
      </ReportShell>
    );
  }

  // -- choose -----------------------------------------------------------
  return (
    <ReportShell step="describe">
      <ReportStepHeading title="Describe the problem" subtitle="In your own words — voice or text." />
      {error ? <ErrorNote message={error} /> : null}

      {voiceAvailable ? (
        <Pressable
          accessibilityRole="button"
          onPress={startRecording}
          style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
        >
          <View style={styles.choiceIcon}>
            <Ionicons name="mic-outline" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Use voice</Text>
            <Text style={styles.choiceBody}>Speak in Urdu or any language you're comfortable in</Text>
          </View>
        </Pressable>
      ) : __DEV__ ? (
        <Text style={styles.devHint}>
          Voice recording needs a development build (npx expo run:android) — typing works now.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("type")}
        style={({ pressed }) => [styles.choiceCardQuiet, pressed && styles.pressed]}
      >
        <View style={styles.choiceIconQuiet}>
          <Ionicons name="create-outline" size={20} color={colors.civic700} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitleQuiet}>Type instead</Text>
        </View>
      </Pressable>
    </ReportShell>
  );
}

const styles = StyleSheet.create({
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.civic600,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitle: { fontSize: 16, fontWeight: "700", color: colors.white },
  choiceBody: { marginTop: 2, fontSize: 13, color: "rgba(255,255,255,0.8)" },
  choiceCardQuiet: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceIconQuiet: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitleQuiet: { fontSize: 15, fontWeight: "700", color: colors.ink },
  pressed: { opacity: 0.8 },
  devHint: {
    marginTop: spacing.md,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center",
  },
  recordingCentre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl * 3 },
  micHalo: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: { marginTop: spacing.lg, fontSize: 28, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  reviewInput: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    textAlignVertical: "top",
  },
});
