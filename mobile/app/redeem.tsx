import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api/client";
import { Body, Button, ErrorNote, Field, Screen, Title } from "@/components/ui";
import { colors, spacing } from "@/theme";

/*
 * Redeeming an authority invitation.
 *
 * Government accounts are never self-registered — an administrator issues an
 * invitation and the token in it is the only thing that can create the
 * account. The web flow puts that token in a link; on a phone the same token
 * is pasted here, because a link sent by WhatsApp is far more likely to be
 * copied than tapped through to a browser.
 *
 * Nothing about authority is decided here. This screen posts the token and the
 * chosen password to the SAME endpoint the web uses, and the server reads the
 * role, organisation and department from the invitation row. A wrong or expired
 * token simply fails — it cannot be talked into granting anything.
 */
export default function RedeemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token, setToken] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const ready =
    token.trim().length > 0 && name.trim().length > 1 && password.length >= 8 && !mismatch;

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      /*
       * The token may be pasted as the whole invitation URL. Taking the last
       * path segment means both a bare token and a full link work, which is
       * what people actually paste.
       */
      const raw = token.trim();
      const value = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;

      await api(`/api/gov/invites/${encodeURIComponent(value)}/accept`, {
        method: "POST",
        body: { name: name.trim(), password, confirmPassword: confirm },
      });

      /*
       * The accept endpoint signs a BROWSER in by setting a cookie. On a phone
       * the cookie jar is ours and that response is not routed through it, so
       * rather than half-capture a session we hand over to the sign-in screen,
       * which owns that path properly.
       */
      router.replace("/sign-in?redeemed=1&intent=authority");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That invitation could not be redeemed.");
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
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <Title>Redeem an invitation</Title>
          <Body muted>
            Paste the invitation link or token your administrator sent you, then choose a password.
          </Body>

          <View style={{ marginTop: spacing.xl }}>
            {error ? <ErrorNote message={error} /> : null}

            <Field
              label="Invitation link or token"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste it here"
            />
            <Field
              label="Your full name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              placeholder="Your name"
            />
            <Field
              label="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <Field
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Re-enter your password"
            />

            {mismatch ? <Text style={styles.mismatch}>Both passwords must match.</Text> : null}

            <Button label="Activate account" onPress={submit} busy={busy} disabled={!ready} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
  mismatch: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
});
