import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { registrationStep } from "@/api/client";
import { useRegistration } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { isValidEmail, isValidPhone } from "@/registration/validation";
import { Button, ErrorNote, Field } from "@/components/ui";
import { colors, spacing } from "@/theme";

/*
 * How the departments reach you.
 *
 * Both fields are checked server-side for uniqueness as well as shape, so a
 * duplicate email comes back as a field error rather than a generic failure —
 * which matters, because "this email is already registered" is the one message
 * that tells someone they should be signing in instead.
 */
export default function ContactScreen() {
  const router = useRouter();
  const { setDraft } = useRegistration();

  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const phoneOk = isValidPhone(phone);
  const emailOk = isValidEmail(email);

  async function submit() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = await registrationStep("/api/registration/step", {
      step: "contact",
      values: { phone, email },
    });

    setBusy(false);

    if (!payload.success) {
      if (payload.fieldErrors) {
        const flattened: Record<string, string> = {};
        for (const [key, messages] of Object.entries(payload.fieldErrors)) {
          if (Array.isArray(messages) && messages[0]) flattened[key] = String(messages[0]);
        }
        setFieldErrors(flattened);
      }
      setError(payload.message ?? "Those details could not be saved.");
      return;
    }

    setDraft({ contact: { phone, email } });
    router.push("/register/security");
  }

  return (
    <RegistrationShell step="contact">
      <StepHeading
        title="How can we reach you?"
        subtitle="We use these to tell you what happened to your reports — nothing else."
      />

      {error ? <ErrorNote message={error} /> : null}

      <Field
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+92 300 1234567"
      />
      {fieldErrors.phone ?? (phone.length > 0 && !phoneOk) ? (
        <Text style={styles.error}>
          {fieldErrors.phone ?? "Enter a Pakistani mobile number, for example +92 300 1234567."}
        </Text>
      ) : null}

      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      {fieldErrors.email ?? (email.length > 0 && !emailOk) ? (
        <Text style={styles.error}>
          {fieldErrors.email ?? "Please enter a valid email address."}
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Note icon="mail-outline">
          Your email is also how you sign in, so use one you can still get into.
        </Note>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label="Continue"
          onPress={() => void submit()}
          busy={busy}
          disabled={!phoneOk || !emailOk}
        />
      </View>
    </RegistrationShell>
  );
}

const styles = {
  error: { marginTop: -spacing.sm, marginBottom: spacing.md, fontSize: 12, color: colors.danger },
} as const;
