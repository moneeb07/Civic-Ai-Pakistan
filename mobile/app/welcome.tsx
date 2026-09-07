import * as React from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The landing screen — the phone's front door, redesigned to match the web
 * app's current landing hero rather than the version this screen used to
 * mirror. Three things changed together, because they are one decision:
 *
 * 1. A REAL PHOTOGRAPH stands behind the hero, not a plain canvas
 *    background. Every other screen in this app is icons and colour; this
 *    is the one place a citizen should feel "this is Pakistan's own
 *    service" before reading a word — the same job the photo does on web.
 *    It is a portrait photograph (852x1846), composed for a phone screen
 *    rather than a cropped-down desktop banner, and bundled locally
 *    (`assets/images/landing-hero-portrait.webp`) rather than fetched over
 *    the network, so it is there on a slow connection too.
 *
 * 2. The heavy dark "Authority Operations Portal" panel is gone. Web
 *    dropped it the same way for the same reason: it gave one audience a
 *    quarter of the screen for a single sign-in button. Authority access is
 *    now a compact link under the citizen hero — one tap away, not a
 *    second half of the page.
 *
 * 3. Text sitting on the photograph gets TWO layers of contrast protection,
 *    not one. A flat white scrim helps the average case; a text-shadow is
 *    what was actually proven necessary on web, where a wash tuned for one
 *    crop of a photo went unreadable the moment the crop changed. The
 *    shadow guarantees legibility against whatever ends up behind a given
 *    word, at any screen size, without hand-tuning per device.
 *
 * Citizens sign themselves up here; authority staff never can — their
 * accounts are issued by an administrator and activated with an invitation
 * token. Both doors lead to the same one sign-in screen; what an account may
 * do is decided by the server from the officer record, never by which
 * button was pressed — see src/context/session.tsx.
 */

const FEATURES = [
  { icon: "leaf-outline", label: "Cleaner\nCommunities" },
  { icon: "shield-checkmark-outline", label: "Safer\nCities" },
  { icon: "people-outline", label: "Stronger\nTogether" },
  { icon: "bar-chart-outline", label: "Real\nImpact" },
] as const;

const TRUST_FACTS = [
  { icon: "location-outline", value: "Built for Pakistan", detail: "Every city, every citizen" },
  { icon: "sparkles-outline", value: "Free", detail: "Always, for citizens" },
  { icon: "globe-outline", value: "اردو", detail: "Report in your language" },
  { icon: "shield-checkmark-outline", value: "Public", detail: "Every outcome published" },
] as const;

const STEPS = [
  { icon: "camera-outline", title: "Report it in a minute", detail: "A photo, a location, done." },
  { icon: "git-branch-outline", title: "AI routes it to the right desk", detail: "No forms, no phone calls." },
  { icon: "layers-outline", title: "Duplicate reports become one issue", detail: "Your street speaks once, loudly." },
  { icon: "checkmark-done-outline", title: "The outcome is public", detail: "Every resolution on the record." },
] as const;

const heroImage = require("../assets/images/landing-hero-portrait.webp");

// One shadow, reused on every piece of text that sits directly on the photo.
const photoTextShadow = {
  textShadowColor: "rgba(255,255,255,0.85)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

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
      <ScrollView showsVerticalScrollIndicator={false}>
        <ImageBackground source={heroImage} resizeMode="cover" style={styles.hero}>
          {/* Flat scrim first — the average-case contrast helper. */}
          <View style={styles.scrim} />

          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.brandRow}>
              <View style={styles.brandGroup}>
                <View style={styles.logoMark}>
                  <Ionicons name="moon" size={16} color={colors.white} />
                </View>
                <View>
                  <Text style={[styles.brand, photoTextShadow]}>CivicAI</Text>
                  <Text style={[styles.brandSub, photoTextShadow]}>PAKISTAN</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/sign-in?intent=authority")}
                style={({ pressed }) => [styles.authorityChip, pressed && styles.pressed]}
              >
                <Ionicons name="lock-closed-outline" size={13} color={colors.civic700} />
                <Text style={styles.authorityChipText}>Authority</Text>
              </Pressable>
            </View>

            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowItem}>
                <Ionicons name="shield-checkmark-outline" size={12} color={colors.civic700} />
                <Text style={[styles.eyebrowStrong, photoTextShadow]}>For Citizens</Text>
              </View>
              <Text style={[styles.eyebrowDim, photoTextShadow]}> · Cleaner Cities · Stronger Pakistan</Text>
            </View>

            <Text style={[styles.headline, photoTextShadow]}>
              Your Voice.{"\n"}Your City.{"\n"}
              <Text style={{ color: colors.civic600 }}>Your CivicAI.</Text>
            </Text>

            <Text style={[styles.lede, photoTextShadow]}>
              Report issues, track progress, and be part of the change. Together, let&rsquo;s build
              cleaner, safer and better communities across Pakistan.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/register")}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="megaphone-outline" size={17} color={colors.white} />
              <Text style={styles.primaryBtnText}>Report a Problem</Text>
              <Ionicons name="arrow-forward" size={17} color={colors.white} />
            </Pressable>

            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/register")}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.civic700} />
                <Text style={styles.secondaryBtnText}>Sign Up</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/sign-in")}
                style={({ pressed }) => [styles.darkBtn, pressed && styles.pressed]}
              >
                <Ionicons name="log-in-outline" size={16} color={colors.white} />
                <Text style={styles.darkBtnText}>Sign In</Text>
              </Pressable>
            </View>

            <View style={styles.featureRow}>
              {FEATURES.map((feature) => (
                <View key={feature.label} style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon} size={18} color={colors.civic700} />
                  </View>
                  <Text style={[styles.featureLabel, photoTextShadow]}>{feature.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/*
            The trust bar, anchored to the bottom of the photo the same way
            it sits at the bottom of the photo on web — the one dark, solid
            surface in the whole hero, which is what makes white text on it
            need no shadow of its own.
          */}
          <View style={styles.trustBar}>
            {TRUST_FACTS.map((fact) => (
              <View key={fact.value} style={styles.trustItem}>
                <Ionicons name={fact.icon} size={14} color={colors.civic200} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trustValue}>{fact.value}</Text>
                  <Text style={styles.trustDetail}>{fact.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </ImageBackground>

        {/*
          Authority access, compact — one line of context and two links,
          replacing what used to be a full dark panel here. Redeeming an
          invitation is the one thing a new officer can actually do without
          already having an account; everyone else uses the sign-in above.
        */}
        <View style={styles.authoritySection}>
          <Text style={styles.authorityTitle}>Authority access</Text>
          <Text style={styles.authorityBody}>
            Secure access for civic departments. Accounts are issued by your authority&rsquo;s
            administrator — never self-registered.
          </Text>
          <View style={styles.authorityLinks}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in?intent=authority")}
              style={({ pressed }) => [styles.authorityLink, pressed && styles.pressed]}
            >
              <Text style={styles.authorityLinkText}>Authority sign in</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.civic700} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/redeem")}
              style={({ pressed }) => [styles.authorityLink, pressed && styles.pressed]}
            >
              <Text style={styles.authorityLinkText}>Redeem an invitation</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.civic700} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.steps, { paddingBottom: insets.bottom + spacing.xl }]}>
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

const styles = StyleSheet.create({
  hero: { width: "100%" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.42)" },
  heroContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },

  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandGroup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 17, fontWeight: "800", color: colors.ink, letterSpacing: -0.3, lineHeight: 18 },
  brandSub: { fontSize: 9, fontWeight: "700", color: colors.muted, letterSpacing: 1 },

  authorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  authorityChipText: { fontSize: 12, fontWeight: "700", color: colors.civic700 },
  pressed: { opacity: 0.75 },

  eyebrowRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.xl },
  eyebrowItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  eyebrowStrong: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.civic700 },
  eyebrowDim: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.muted },

  headline: {
    marginTop: spacing.sm,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1,
  },
  lede: { marginTop: spacing.md, fontSize: 14.5, lineHeight: 21, color: colors.ink },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.civic600,
    shadowColor: colors.civic900,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.white },

  secondaryRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.civic600,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  secondaryBtnText: { fontSize: 14.5, fontWeight: "700", color: colors.civic700 },
  darkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  darkBtnText: { fontSize: 14.5, fontWeight: "700", color: colors.white },

  featureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xl },
  featureItem: { alignItems: "center", width: "23%" },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: "rgba(241,250,246,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    marginTop: 6,
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    lineHeight: 13,
  },

  trustBar: {
    marginTop: spacing.xl,
    backgroundColor: "rgba(0,59,47,0.88)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  trustItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  trustValue: { fontSize: 13.5, fontWeight: "700", color: colors.white },
  trustDetail: { fontSize: 10.5, color: "rgba(255,255,255,0.65)" },

  authoritySection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  authorityTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.civic700 },
  authorityBody: { marginTop: spacing.sm, fontSize: 13.5, lineHeight: 20, color: colors.muted },
  authorityLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginTop: spacing.md },
  authorityLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  authorityLinkText: { fontSize: 13.5, fontWeight: "700", color: colors.civic700 },

  steps: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  stepsEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.4, color: colors.muted },
  stepsTitle: {
    marginTop: spacing.sm,
    fontSize: 22,
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
