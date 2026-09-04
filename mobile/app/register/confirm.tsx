import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { registrationStep } from "@/api/client";
import { useRegistration } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { maskCnic, maskEmail, maskPhone } from "@/registration/validation";
import { Button, ErrorNote } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The last screen before an account exists.
 *
 * Everything sensitive is shown MASKED. The citizen already checked the full
 * values on the step that collected them, and a phone screen is read over
 * shoulders on buses — there is nothing to gain by printing a CNIC in full
 * here. Each section offers a way back to the step that owns it.
 *
 * This is also the only place the password is used: it is read out of memory,
 * sent once to /api/registration/complete, and dropped.
 */
export default function ConfirmScreen() {
  const router = useRouter();
  const { draft, passwordSet, readPassword, reset } = useRegistration();

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const identity = draft.identity;
  const contact = draft.contact;
  const address = draft.address;

  async function createAccount() {
    const password = readPassword();

    /*
     * The vault is memory-only, so a reload during development — or the OS
     * reclaiming the app — can empty it. Sending the citizen back to choose a
     * password again is the honest response; persisting one to survive that
     * would defeat the point of the vault.
     */
    if (!password) {
      router.push("/register/security");
      return;
    }

    setBusy(true);
    setError(null);

    const payload = await registrationStep("/api/registration/complete", { password });

    setBusy(false);

    if (!payload.success) {
      if (payload.reason === "expired") {
        setError("Your registration timed out. Please start again.");
        return;
      }
      setError(payload.message ?? "Your account could not be created.");
      return;
    }

    /*
     * The account exists. Everything held for the signup has done its job —
     * drop it before leaving, so nothing survives into the signed-in app.
     */
    reset();
    router.replace("/register/complete");
  }

  return (
    <RegistrationShell step="confirm">
      <StepHeading
        title="Check and confirm"
        subtitle="Nothing has been saved yet. Your account is created when you press the button below."
      />

      {error ? <ErrorNote message={error} /> : null}

      <Section
        title="Identity"
        icon="person-outline"
        onEdit={() => router.push("/register/review")}
        rows={[
          ["Name", identity.fullName || "—"],
          ["Father / husband", identity.fatherName || "—"],
          ["CNIC", identity.cnicNumber ? maskCnic(identity.cnicNumber) : "—"],
          ["Date of birth", identity.dateOfBirth || "—"],
          ["Gender", identity.gender || "—"],
        ]}
      />

      <Section
        title="Contact"
        icon="call-outline"
        onEdit={() => router.push("/register/contact")}
        rows={[
          ["Mobile", contact?.phone ? maskPhone(contact.phone) : "—"],
          ["Email", contact?.email ? maskEmail(contact.email) : "—"],
        ]}
      />

      <Section
        title="Address"
        icon="location-outline"
        onEdit={() => router.push("/register/address")}
        rows={[
          ["Current", address?.residentialAddress || "—"],
          ["City", address?.city || "—"],
          ["District", address?.district || "—"],
          ["Permanent", address?.permanentAddress || "—"],
        ]}
      />

      <Section
        title="Photo"
        icon="image-outline"
        onEdit={() => router.push("/register/photo")}
        rows={[["Profile photo", draft.hasPhoto ? "Added" : "Not added"]]}
      />

      {!passwordSet ? (
        <View style={{ marginTop: spacing.lg }}>
          <Note icon="key-outline">
            Your password is no longer in memory. You will be asked to choose it again.
          </Note>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Note icon="lock-closed-outline">
          Your CNIC is encrypted before it is stored. CivicAI checks that it is correctly
          formatted — it does not verify it with NADRA.
        </Note>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Create my account" onPress={() => void createAccount()} busy={busy} />
      </View>
    </RegistrationShell>
  );
}

function Section({
  title,
  icon,
  rows,
  onEdit,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  rows: [string, string][];
  onEdit: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={colors.civic700} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>

      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={2}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
  edit: { fontSize: 13, fontWeight: "600", color: colors.civic700 },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 5 },
  rowLabel: { width: 110, fontSize: 13, color: colors.muted },
  rowValue: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.ink },
});
