import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/context/session";
import { Body, Button, ErrorNote, Field, Screen, Title } from "@/components/ui";
import { Pressable } from "react-native";
import { colors, spacing } from "@/theme";

/*
 * One sign-in for both faces of the app.
 *
 * There is no "sign in as an officer" option, and that is deliberate: staff
 * accounts are ordinary accounts that happen to have an officer record, so a
 * separate door would only invite people to hunt for the "real" one. What the
 * account can do is settled by the server after sign-in, not by which button
 * was pressed before it.
 */
export default function SignInScreen() {
  const { me, signIn } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * `intent` only changes the words on this screen, never the request.
   * Arriving from "Authority sign in" and from "Sign in" posts exactly the
   * same credentials to exactly the same endpoint — what the account may do is
   * read from its officer record by the server afterwards. If the copy and the
   * permissions could ever disagree, the copy would be a lie.
   */
  const { intent, redeemed } = useLocalSearchParams<{ intent?: string; redeemed?: string }>();
  const authority = intent === "authority";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (me) return <Redirect href="/home" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>CivicAI</Text>
          <Text style={styles.country}>Pakistan</Text>

          <View style={{ marginTop: spacing.xl }}>
            <Title>{authority ? "Authority sign in" : "Sign in"}</Title>
            <Body muted>
              {authority
                ? "Use the account your authority's administrator issued you."
                : "Report a problem, or work on your department's cases."}
            </Body>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            {redeemed ? (
              <View style={styles.redeemed}>
                <Text style={styles.redeemedText}>
                  Account activated. Sign in with the password you just chose.
                </Text>
              </View>
            ) : null}

            {error ? <ErrorNote message={error} /> : null}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="Your password"
            />

            <Button
              label="Sign in"
              onPress={submit}
              busy={busy}
              disabled={!email.trim() || !password}
            />

            {authority ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/redeem")}
                style={{ marginTop: spacing.lg, alignItems: "center" }}
              >
                <Text style={styles.link}>Have an invitation? Redeem it</Text>
              </Pressable>
            ) : null}

            {/*
              Only for citizens. An officer who has no account cannot make one
              here — or anywhere — so offering it under "Authority sign in"
              would advertise a door that never opens for them.
            */}
            {!authority ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/register")}
                style={{ marginTop: spacing.lg, alignItems: "center" }}
              >
                <Text style={styles.link}>New to CivicAI? Create an account</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/welcome")}
              style={{ marginTop: spacing.lg, alignItems: "center" }}
            >
              <Text style={styles.linkMuted}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
  brand: { fontSize: 28, fontWeight: "800", color: colors.civic700, letterSpacing: -0.5 },
  country: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 1 },
  link: { fontSize: 14, fontWeight: "600", color: colors.civic700 },
  linkMuted: { fontSize: 14, fontWeight: "600", color: colors.muted },
  redeemed: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  redeemedText: { fontSize: 13, color: colors.civic700, fontWeight: "600" },
});
