import * as React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme";

/*
 * The frame every registration step sits in, mirroring the web's
 * RegistrationShell: a back arrow, the brand, and a progress bar pinned under
 * the header so the citizen can always see where they are.
 *
 * Six visible groups, matching src/components/registration/step-progress.tsx.
 * "review" is folded into Identity because, to the citizen, scanning a card and
 * checking what was read are one task.
 */

export const STEP_GROUPS = [
  { key: "identity", label: "Identity" },
  { key: "contact", label: "Contact" },
  { key: "security", label: "Security" },
  { key: "address", label: "Address" },
  { key: "photo", label: "Photo" },
  { key: "confirm", label: "Review" },
] as const;

export type StepKey = (typeof STEP_GROUPS)[number]["key"];

export function StepProgress({ current }: { current: StepKey }) {
  const activeIndex = STEP_GROUPS.findIndex((group) => group.key === current);

  return (
    <View>
      {/* Numeric position — the fastest way to answer "where am I?". */}
      <Text style={styles.counter}>
        Step {activeIndex + 1} of {STEP_GROUPS.length}
        <Text style={styles.counterDot}> · </Text>
        <Text style={styles.counterLabel}>{STEP_GROUPS[activeIndex]?.label}</Text>
      </Text>

      <View style={styles.bars}>
        {STEP_GROUPS.map((group, index) => (
          <View
            key={group.key}
            style={[
              styles.bar,
              index < activeIndex && { backgroundColor: colors.civic500 },
              index === activeIndex && { backgroundColor: colors.civic600 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function RegistrationShell({
  step,
  onBack,
  children,
}: {
  step: StepKey;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
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

        <View style={{ marginTop: spacing.md }}>
          <StepProgress current={step} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing.xl * 2,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Standard title block for a step. One purpose per screen. */
export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** A short explanatory note — why we are asking, or what happens next. */
export function Note({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={16} color={colors.civic700} />
      <Text style={styles.noteText}>{children}</Text>
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

  counter: { fontSize: 13, fontWeight: "500", color: colors.muted },
  counterDot: { color: colors.lineStrong },
  counterLabel: { color: colors.ink },
  bars: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  bar: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.lineStrong },

  title: { fontSize: 25, fontWeight: "800", color: colors.ink, letterSpacing: -0.6 },
  subtitle: { marginTop: spacing.sm, fontSize: 15, lineHeight: 22, color: colors.muted },

  note: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.civic700 },
});
