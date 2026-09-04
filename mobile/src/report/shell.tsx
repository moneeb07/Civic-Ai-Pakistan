import * as React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme";

/*
 * The frame every report-creation step sits in — a named 4-step bar, not
 * anonymous dots, mirroring the web's ReportShell exactly (01 Photo · 02
 * Describe · 03 Location · 04 Review) and deliberately visually consistent
 * with the registration wizard's shell, the same way the web app keeps the
 * two flows looking like one product.
 */

export const REPORT_STEPS = [
  { key: "camera", label: "Photo" },
  { key: "describe", label: "Describe" },
  { key: "location", label: "Location" },
  { key: "review", label: "Review" },
] as const;

export type ReportStepKey = (typeof REPORT_STEPS)[number]["key"];

export function ReportShell({
  step,
  onBack,
  children,
  scroll = true,
}: {
  step: ReportStepKey;
  onBack?: () => void;
  children: React.ReactNode;
  /** Off for the camera step, which manages its own full-bleed layout. */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeIndex = REPORT_STEPS.findIndex((s) => s.key === step);

  const content = (
    <>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack ?? (() => router.back())}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={colors.muted} />
          </Pressable>
          <Text style={styles.brand}>CivicAI</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.steps}>
          {REPORT_STEPS.map((s, index) => (
            <View key={s.key} style={styles.stepItem}>
              <View
                style={[
                  styles.stepBar,
                  index < activeIndex && { backgroundColor: colors.civic500 },
                  index === activeIndex && { backgroundColor: colors.civic600 },
                ]}
              />
              <Text
                style={[styles.stepLabel, index === activeIndex && styles.stepLabelActive]}
                numberOfLines={1}
              >
                {String(index + 1).padStart(2, "0")} {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl * 2 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </>
  );

  return (
    <View style={styles.root}>
      {scroll ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}

export function ReportStepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  steps: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  stepItem: { flex: 1 },
  stepBar: { height: 4, borderRadius: radius.pill, backgroundColor: colors.lineStrong },
  stepLabel: { marginTop: 4, fontSize: 10, fontWeight: "600", color: colors.muted },
  stepLabelActive: { color: colors.civic700 },
  title: { fontSize: 23, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.sm, fontSize: 14, lineHeight: 21, color: colors.muted },
});
