import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/context/session";
import { Body, Button, ErrorNote, Field, Screen, Title } from "@/components/ui";
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
            <Title>Sign in</Title>
            <Body muted>Report a problem, or work on your department&rsquo;s cases.</Body>
          </View>

          <View style={{ marginTop: spacing.xl }}>
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
});
