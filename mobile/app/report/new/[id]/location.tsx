import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type * as ExpoLocationNS from "expo-location";

import { submitLocation } from "@/api/client";
import { ReportShell, ReportStepHeading } from "@/report/shell";
import { Button, ErrorNote, Field } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Step three: where.
 *
 * Foreground-only, one-shot — never a background/continuous location
 * subscription, matching the web's explicit privacy stance: this screen is
 * the only place location is ever requested, and only when the citizen taps
 * the button, never on app open.
 *
 * expo-location is loaded with require() inside a try/catch, not a static
 * import — see the identical, longer note in describe.tsx for why: a static
 * import resolves the native module eagerly, so on a dev client built before
 * this package was added the whole file would throw before its own default
 * export is reached. This way manual entry works today; GPS activates itself
 * the moment the client is rebuilt.
 */
let Location: typeof ExpoLocationNS | null = null;
try {
  Location = require("expo-location") as typeof ExpoLocationNS;
} catch {
  Location = null;
}
const locationServiceAvailable = Location !== null;

type Mode = "choose" | "locating" | "manual" | "confirm";

export default function ReportLocationStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [mode, setMode] = React.useState<Mode>("choose");
  const [label, setLabel] = React.useState<string | null>(null);
  const [manualInput, setManualInput] = React.useState("");
  const [coords, setCoords] = React.useState<{ lat: number; lng: number; accuracy: number | null } | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function useMyLocation() {
    if (!Location) {
      setError("Location needs a rebuilt app — please enter it manually instead.");
      setMode("manual");
      return;
    }
    setMode("locating");
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission was declined.");
        setMode("manual");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const result = await submitLocation(id, {
        mode: "gps",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? null,
      });

      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
      });
      // Never a fabricated address — raw coordinates if the lookup failed.
      setLabel(
        result.data.locationLabel ??
          `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
      );
      setMode("confirm");
    } catch {
      setError("Could not get your location. You can enter it manually instead.");
      setMode("manual");
    }
  }

  async function confirmGps() {
    router.push(`/report/new/${id}/review`);
  }

  async function submitManual() {
    if (!manualInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await submitLocation(id, { mode: "manual", label: manualInput.trim() });
      router.push(`/report/new/${id}/review`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "locating") {
    return (
      <ReportShell step="location">
        <View style={styles.centre}>
          <ActivityIndicator color={colors.civic600} size="large" />
          <Ionicons name="locate" size={20} color={colors.civic600} style={{ marginTop: spacing.lg }} />
          <Text style={styles.centreTitle}>Finding your location…</Text>
        </View>
      </ReportShell>
    );
  }

  if (mode === "confirm" && coords) {
    return (
      <ReportShell step="location">
        <ReportStepHeading title="Is this the right place?" />
        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.locationCard}>
          <Ionicons name="location" size={20} color={colors.civic700} />
          <Text style={styles.locationLabel}>{label}</Text>
        </View>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button label="Confirm location" onPress={confirmGps} />
          <Button label="Change location" variant="quiet" onPress={() => setMode("manual")} />
        </View>
      </ReportShell>
    );
  }

  if (mode === "manual") {
    return (
      <ReportShell step="location">
        <ReportStepHeading title="Where is the problem?" />
        {error ? <ErrorNote message={error} /> : null}

        <Field
          label="Location"
          value={manualInput}
          onChangeText={setManualInput}
          placeholder="e.g. G-10, Islamabad"
          autoFocus
        />

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Continue" busy={busy} disabled={!manualInput.trim()} onPress={submitManual} />
        </View>
      </ReportShell>
    );
  }

  // -- choose -----------------------------------------------------------
  return (
    <ReportShell step="location">
      <ReportStepHeading title="Where is the problem?" />
      {error ? <ErrorNote message={error} /> : null}

      {locationServiceAvailable ? (
        <Pressable
          accessibilityRole="button"
          onPress={useMyLocation}
          style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
        >
          <View style={styles.choiceIcon}>
            <Ionicons name="locate" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Use my location</Text>
            <Text style={styles.choiceBody}>Fastest — we'll find the address for you</Text>
          </View>
        </Pressable>
      ) : __DEV__ ? (
        <Text style={styles.devHint}>
          GPS needs a development build (npx expo run:android) — enter it manually for now.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("manual")}
        style={({ pressed }) => [styles.choiceCardQuiet, pressed && styles.pressed]}
      >
        <View style={styles.choiceIconQuiet}>
          <Ionicons name="create-outline" size={20} color={colors.civic700} />
        </View>
        <Text style={styles.choiceTitleQuiet}>Enter manually</Text>
      </Pressable>
    </ReportShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl * 4 },
  centreTitle: { marginTop: spacing.lg, fontSize: 16, fontWeight: "700", color: colors.ink },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  locationLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
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
});
