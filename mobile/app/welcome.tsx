import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The landing screen, mirroring the web app's front page.
 *
 * Previously the app opened straight onto a bare sign-in form, which told a
 * first-time visitor nothing: not what CivicAI is, not that reporting is free,
 * and — the part that actually confused people — not that authority staff have
 * their own way in. The web landing page answers all three before asking for
 * a password, so the phone does too.
 *
 * Citizens sign themselves up here; authority staff never can — their accounts
 * are issued by an administrator and activated with an invitation token. That
 * asymmetry is a business rule, not a gap, which is why "Sign up" sits in the
 * citizen half of this screen and the authority panel offers "Redeem an
 * invitation" instead.
 *
 * The two doors are the same door. There is one authentication system and one
 * sign-in screen; "Authority sign in" and "Sign in" both lead to it. What an
 * account may do is decided by the server from the officer record, never by
 * which button was pressed — see src/context/session.tsx. The separate button
 * exists because staff look for it, not because it grants anything.
 */

const STEPS = [
  { icon: "camera-outline", title: "Report it in a minute", detail: "A photo, a location, done." },
  { icon: "git-branch-outline", title: "AI routes it to the right desk", detail: "No forms, no phone calls." },
  { icon: "layers-outline", title: "Duplicate reports become one issue", detail: "Your street speaks once, loudly." },
  { icon: "checkmark-done-outline", title: "The outcome is public", detail: "Every resolution on the record." },
] as const;

const CHAIN = [
  { label: "Authority", detail: "CDA, WASA, LWMC" },
  { label: "Departments", detail: "Roads, Water, Municipal" },
  { label: "Civic issues", detail: "Grouped from reports" },
  { label: "Resolution", detail: "On the public record" },
] as const;

export default function WelcomeScreen() {
  const { me, loading } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  // Already signed in — the gate in index.tsx normally handles this, but a
  // deep link straight to /welcome should not strand a signed-in user here.
  if (me) return <Redirect href="/home" />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Ionicons name="moon" size={18} color={colors.white} />
            </View>
            <Text style={styles.brand}>CivicAI</Text>
          </View>

          <View style={styles.badge}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.civic700} />
            <Text style={styles.badgeText}>For every citizen of Pakistan</Text>
          </View>

          <Text style={styles.headline}>
            Your voice.{"\n"}Your city.{"\n"}
            <Text style={{ color: colors.civic600 }}>Your CivicAI.</Text>
          </Text>

          <Text style={styles.lede}>
            Report a broken street light, a pothole, a water leak. We send it to the department
            responsible and show you exactly what happens next.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/register")}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Report a problem</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.white} />
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/register")}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Sign up</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in")}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Sign in</Text>
            </Pressable>
          </View>

          <View style={styles.factRow}>
            <Fact title="Free" detail="Always, for citizens" />
            <Fact title="اردو" detail="Report in your language" />
            <Fact title="Public" detail="Every outcome published" />
          </View>
        </View>

        {/*
          The authority panel, dark like the web's. It is deliberately visually
          separate: it is not a second product, but it IS a different audience,
          and a citizen should be able to see at a glance that it is not for them.
        */}
        <View style={styles.authorityPanel}>
          <Text style={styles.panelEyebrow}>RESTRICTED ACCESS</Text>
          <Text style={styles.panelTitle}>Authority Operations Portal</Text>
          <Text style={styles.panelBody}>
            Secure access for authorised civic departments and government teams. Accounts are
            issued by your authority&rsquo;s administrator — never self-registered.
          </Text>

          <View style={styles.panelActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in?intent=authority")}
              style={({ pressed }) => [styles.panelPrimary, pressed && styles.pressed]}
            >
              <Text style={styles.panelPrimaryText}>Authority sign in</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.civic900} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/redeem")}
              style={({ pressed }) => [styles.panelGhost, pressed && styles.pressed]}
            >
              <Text style={styles.panelGhostText}>Redeem an invitation</Text>
            </Pressable>
          </View>

          <Text style={[styles.panelEyebrow, { marginTop: spacing.xl }]}>
            CHAIN OF ACCOUNTABILITY
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {CHAIN.map((row) => (
              <View key={row.label} style={styles.chainRow}>
                <Text style={styles.chainLabel}>{row.label}</Text>
                <Text style={styles.chainDetail}>{row.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.steps}>
          <Text style={styles.stepsEyebrow}>HOW IT WORKS</Text>
          <Text style={styles.stepsTitle}>From a photograph to a fixed street</Text>

          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={18} color={colors.civic700} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>
                  {index + 1}. {step.title}
                </Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Fact({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.factTitle}>{title}</Text>
      <Text style={styles.factDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 20, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.xl,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.civic700 },

  headline: {
    marginTop: spacing.lg,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1,
  },
  lede: { marginTop: spacing.md, fontSize: 15, lineHeight: 23, color: colors.muted },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.civic600,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.white },
  secondaryRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  secondaryBtn: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  pressed: { opacity: 0.75 },

  factRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  factTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  factDetail: { fontSize: 11, color: colors.muted, marginTop: 2 },

  authorityPanel: {
    backgroundColor: colors.civic900,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  panelEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: colors.civic200,
  },
  panelTitle: { marginTop: spacing.sm, fontSize: 24, fontWeight: "800", color: colors.white },
  panelBody: {
    marginTop: spacing.md,
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.78)",
  },
  panelActions: { gap: spacing.md, marginTop: spacing.xl },
  panelPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.civic100,
  },
  panelPrimaryText: { fontSize: 15, fontWeight: "700", color: colors.civic900 },
  panelGhost: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  panelGhostText: { fontSize: 15, fontWeight: "600", color: colors.white },

  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  chainLabel: { fontSize: 14, fontWeight: "600", color: colors.white },
  chainDetail: { fontSize: 12, color: "rgba(255,255,255,0.65)" },

  steps: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  stepsEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.4, color: colors.muted },
  stepsTitle: {
    marginTop: spacing.sm,
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  stepRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  stepDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
