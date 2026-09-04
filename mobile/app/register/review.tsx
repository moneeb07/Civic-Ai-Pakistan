import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { registrationStep } from "@/api/client";
import { useRegistration } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import {
  formatCnic,
  genderMatchesCnicConvention,
  isValidCnicFormat,
  LIMITS,
  liveFormatCnic,
} from "@/registration/validation";
import { Button, ErrorNote, Field } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Check what was read.
 *
 * Everything on this screen is editable, including fields the model was
 * confident about. A read is a convenience, never an authority: the citizen's
 * own correction always wins, and nothing reaches the server until they press
 * Continue.
 *
 * Fields the scan supplied are badged, so it is obvious which values came off
 * the card and which were typed. Fields the accuracy gate read but would not
 * vouch for arrive EMPTY and are flagged — showing a guess and calling it
 * extracted would be worse than showing nothing.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { draft, setIdentity } = useRegistration();

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const fields = draft.identity;
  const scanned = draft.source === "cnic_scan";
  const wasExtracted = (name: string) => draft.extracted.includes(name);

  const cnicOk = isValidCnicFormat(fields.cnicNumber);
  const ready = fields.fullName.trim().length > 0 && cnicOk;

  /*
   * NADRA's convention: the last digit is odd for men, even for women. Only
   * ever an advisory prompt to re-check — it must never block registration or
   * overwrite what the citizen said about themselves.
   */
  const genderHint =
    cnicOk && fields.gender
      ? genderMatchesCnicConvention(fields.cnicNumber, fields.gender)
      : null;

  async function submit() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = await registrationStep("/api/registration/identity", {
      fullName: fields.fullName.trim(),
      fatherName: fields.fatherName.trim() || undefined,
      cnicNumber: formatCnic(fields.cnicNumber),
      dateOfBirth: fields.dateOfBirth.trim() || undefined,
      dateOfIssue: fields.dateOfIssue.trim() || undefined,
      dateOfExpiry: fields.dateOfExpiry.trim() || undefined,
      gender: fields.gender || undefined,
      nationality: fields.nationality.trim() || undefined,
      identitySource: draft.source,
      extractedFields: draft.extracted,
      presentAddress: draft.presentAddress,
      permanentAddress: draft.permanentAddress,
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

    router.push("/register/contact");
  }

  return (
    <RegistrationShell step="identity">
      <StepHeading
        title={scanned ? "Check what we read" : "Your identity"}
        subtitle={
          scanned
            ? "We read these off your card. Correct anything that is wrong — your version is the one that counts."
            : "Enter the details exactly as they appear on your CNIC."
        }
      />

      {error ? <ErrorNote message={error} /> : null}

      {draft.withheld.length > 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Note icon="alert-circle-outline">
            Some fields were not clear enough to read, so they were left blank rather than
            guessed. Please fill them in.
          </Note>
        </View>
      ) : null}

      <LabelledField
        label="Full name"
        badge={wasExtracted("fullName")}
        error={fieldErrors.fullName}
        value={fields.fullName}
        onChangeText={(value) => setIdentity({ fullName: value })}
        maxLength={LIMITS.fullName}
        placeholder="As printed on your CNIC"
      />

      <LabelledField
        label="Father's or husband's name"
        badge={wasExtracted("fatherName")}
        error={fieldErrors.fatherName}
        value={fields.fatherName}
        onChangeText={(value) => setIdentity({ fatherName: value })}
        maxLength={LIMITS.fatherName}
        placeholder="Optional"
      />

      <LabelledField
        label="CNIC number"
        badge={wasExtracted("cnicNumber")}
        error={
          fieldErrors.cnicNumber ??
          (fields.cnicNumber.length > 0 && !cnicOk ? "Please check the CNIC number." : undefined)
        }
        value={fields.cnicNumber}
        onChangeText={(value) => setIdentity({ cnicNumber: liveFormatCnic(value) })}
        keyboardType="number-pad"
        placeholder="35202-1234567-1"
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <LabelledField
            label="Date of birth"
            badge={wasExtracted("dateOfBirth")}
            error={fieldErrors.dateOfBirth}
            value={fields.dateOfBirth}
            onChangeText={(value) => setIdentity({ dateOfBirth: value })}
            placeholder="DD.MM.YYYY"
          />
        </View>
        <View style={{ flex: 1 }}>
          <LabelledField
            label="Expiry"
            badge={wasExtracted("dateOfExpiry")}
            error={fieldErrors.dateOfExpiry}
            value={fields.dateOfExpiry}
            onChangeText={(value) => setIdentity({ dateOfExpiry: value })}
            placeholder="DD.MM.YYYY"
          />
        </View>
      </View>

      <Text style={styles.label}>Gender</Text>
      <View style={styles.genderRow}>
        {(["Male", "Female"] as const).map((option) => {
          const active = fields.gender === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setIdentity({ gender: active ? "" : option })}
              style={[styles.genderTab, active && styles.genderTabActive]}
            >
              <Text style={[styles.genderLabel, active && styles.genderLabelActive]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {genderHint === false ? (
        <Text style={styles.advisory}>
          The last digit of your CNIC usually indicates the other gender. Please double-check
          both — we will save whatever you choose.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label="Continue"
          onPress={() => void submit()}
          busy={busy}
          disabled={!ready}
        />
      </View>
    </RegistrationShell>
  );
}

/** A field with an optional "from your CNIC" badge and its own error line. */
function LabelledField({
  label,
  badge,
  error,
  ...props
}: React.ComponentProps<typeof Field> & { badge?: boolean; error?: string }) {
  return (
    <View>
      {badge ? (
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={11} color={colors.civic700} />
          <Text style={styles.badgeText}>From your CNIC</Text>
        </View>
      ) : null}
      <Field label={label} {...props} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink, marginBottom: spacing.sm },
  genderRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  genderTab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  genderTabActive: { borderColor: colors.civic600, backgroundColor: colors.civic50 },
  genderLabel: { fontSize: 15, fontWeight: "600", color: colors.muted },
  genderLabelActive: { color: colors.civic700 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.civic700, letterSpacing: 0.3 },

  fieldError: { marginTop: -spacing.sm, marginBottom: spacing.md, fontSize: 12, color: colors.danger },
  advisory: {
    marginBottom: spacing.md,
    fontSize: 12,
    lineHeight: 18,
    color: colors.amber700,
  },
});
