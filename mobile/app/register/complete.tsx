import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The account exists.
 *
 * The citizen is deliberately NOT signed in automatically. /api/registration/complete
 * signs a BROWSER in by setting a cookie; on a phone that response is not
 * routed through our cookie jar, so rather than half-capture a session we hand
 * over to the sign-in screen, which owns that path properly — the same choice
 * the invitation redemption screen makes.
 */
export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl * 2 }]}>
        <View style={styles.tick}>
          <Ionicons name="checkmark" size={40} color={colors.white} />
        </View>

        <Text style={styles.title}>You're registered</Text>
        <Text style={styles.body}>
          Your CivicAI account is ready. Sign in with the email and password you just chose, and
          you can report your first problem straight away.
        </Text>

        <View style={styles.facts}>
          <Fact icon="camera-outline" text="Photograph a problem and we route it for you" />
          <Fact icon="notifications-outline" text="We tell you each time it moves" />
          <Fact icon="earth-outline" text="Report in Urdu or your own language" />
        </View>

        <View style={{ alignSelf: "stretch", marginTop: spacing.xl }}>
          <Button label="Sign in" onPress={() => router.replace("/sign-in")} />
        </View>
      </View>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={17} color={colors.civic700} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", padding: spacing.xl },
  tick: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: spacing.xl,
    fontSize: 27,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  body: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 23,
    color: colors.muted,
    textAlign: "center",
  },
  facts: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xl * 1.5 },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.civic50,
  },
  factText: { flex: 1, fontSize: 14, color: colors.ink },
});
