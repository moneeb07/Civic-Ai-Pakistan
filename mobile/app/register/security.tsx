import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useRegistration } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { LIMITS } from "@/registration/validation";
import { Button, Field } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Choose a password.
 *
 * This step makes NO network call, and that is the point. The password is held
 * in memory on this device and sent exactly once, to /api/registration/complete,
 * at the moment the account is created. It is never written into the
 * registration session, so a half-finished signup on a shared phone cannot
 * leak it.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const { setPassword } = useRegistration();

  const [password, setValue] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const longEnough = password.length >= LIMITS.passwordMin;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = longEnough && password === confirm;

  function submit() {
    setPassword(password);
    router.push("/register/address");
  }

  return (
    <RegistrationShell step="security">
      <StepHeading
        title="Create a password"
        subtitle="You'll use this with your email to sign in."
      />

      <Field
        label="Password"
        value={password}
        onChangeText={setValue}
        secureTextEntry
        autoComplete="new-password"
        placeholder={`At least ${LIMITS.passwordMin} characters`}
      />

      <View style={styles.rule}>
        <Ionicons
          name={longEnough ? "checkmark-circle" : "ellipse-outline"}
          size={15}
          color={longEnough ? colors.civic600 : colors.muted}
        />
        <Text style={[styles.ruleText, longEnough && { color: colors.civic700 }]}>
          At least {LIMITS.passwordMin} characters
        </Text>
      </View>

      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        placeholder="Re-enter your password"
      />

      {mismatch ? <Text style={styles.mismatch}>Both passwords must match.</Text> : null}

      <View style={{ marginTop: spacing.lg }}>
        <Note icon="shield-checkmark-outline">
          Your password stays on this phone until your account is created. It is never stored
          with your part-finished registration.
        </Note>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Continue" onPress={submit} disabled={!ready} />
      </View>
    </RegistrationShell>
  );
}

const styles = StyleSheet.create({
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
  },
  ruleText: { fontSize: 13, color: colors.muted },
  mismatch: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    fontSize: 12,
    color: colors.danger,
  },
});
