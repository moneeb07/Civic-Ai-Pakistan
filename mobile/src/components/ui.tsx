import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, radius, spacing } from "@/theme";

/* The handful of primitives every screen needs. Small on purpose. */

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  busy,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "quiet";
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === "quiet" && styles.buttonQuiet,
        inactive && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "quiet" ? colors.ink : colors.white} />
      ) : (
        <Text style={[styles.buttonLabel, variant === "quiet" && { color: colors.ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={colors.civic600} />
    </View>
  );
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Pill({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "civic" | "warn" }) {
  const background =
    tone === "civic" ? colors.civic100 : tone === "warn" ? colors.amber100 : colors.canvas;
  const foreground =
    tone === "civic" ? colors.civic700 : tone === "warn" ? colors.amber700 : colors.muted;

  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillText, { color: foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    // 48 keeps every tap target comfortable for a thumb.
    minHeight: 48,
    fontSize: 15,
    color: colors.ink,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonQuiet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  buttonLabel: { color: colors.white, fontSize: 15, fontWeight: "600" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  emptyDetail: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  error: {
    backgroundColor: "#FEF2F2",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 14 },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },
});
