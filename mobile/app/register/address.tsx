import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { registrationStep } from "@/api/client";
import { useRegistration, type CnicAddress } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { LIMITS } from "@/registration/validation";
import { Button, ErrorNote, Field } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Where you live.
 *
 * The back of a CNIC carries a present and a permanent address, so when it was
 * read successfully these arrive pre-filled — but only fields the card
 * actually supplied, and every one of them stays editable. Nothing is invented
 * to fill a gap.
 *
 * "District" sits alongside "Sector" because sectors (G-11, F-8) are an
 * Islamabad convention; most Pakistani cities address by tehsil or district
 * instead, and a form offering only "sector" would leave most citizens with
 * nowhere to put real information.
 */

function joined(address: CnicAddress | null): string {
  if (!address) return "";
  if (address.raw) return address.raw;
  return [address.houseNumber, address.streetOrMohalla, address.sector, address.district, address.city]
    .filter(Boolean)
    .join(", ");
}

export default function AddressScreen() {
  const router = useRouter();
  const { draft, setDraft } = useRegistration();

  const present = draft.presentAddress;
  const permanent = draft.permanentAddress;

  const [values, setValues] = React.useState({
    houseNumber: present?.houseNumber ?? "",
    city: present?.city ?? "",
    district: present?.district ?? "",
    sector: present?.sector ?? "",
    street: present?.streetOrMohalla ?? "",
    road: "",
    residentialAddress: joined(present),
    permanentAddress: joined(permanent),
  });

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const ready = values.city.trim().length > 0 && values.residentialAddress.trim().length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = await registrationStep("/api/registration/step", {
      step: "address",
      values,
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
      setError(payload.message ?? "That address could not be saved.");
      return;
    }

    setDraft({
      address: {
        houseNumber: values.houseNumber,
        city: values.city,
        district: values.district,
        sector: values.sector,
        street: values.street,
        residentialAddress: values.residentialAddress,
        permanentAddress: values.permanentAddress,
      },
    });
    router.push("/register/photo");
  }

  const prefilled = Boolean(present);

  return (
    <RegistrationShell step="address">
      <StepHeading
        title="Where do you live?"
        subtitle={
          prefilled
            ? "We read this from the back of your CNIC. Change anything that is out of date."
            : "This tells us which department covers the problems you report."
        }
      />

      {error ? <ErrorNote message={error} /> : null}

      {prefilled ? (
        <View style={styles.fromCard}>
          <Ionicons name="sparkles" size={14} color={colors.civic700} />
          <Text style={styles.fromCardText}>Pre-filled from your CNIC</Text>
        </View>
      ) : null}

      <Field
        label="Current address"
        value={values.residentialAddress}
        onChangeText={set("residentialAddress")}
        maxLength={LIMITS.residentialAddress}
        multiline
        placeholder="House, street, area"
      />
      {fieldErrors.residentialAddress ? (
        <Text style={styles.error}>{fieldErrors.residentialAddress}</Text>
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="House / flat no."
            value={values.houseNumber}
            onChangeText={set("houseNumber")}
            maxLength={LIMITS.houseNumber}
            placeholder="Optional"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Street or mohalla"
            value={values.street}
            onChangeText={set("street")}
            maxLength={LIMITS.street}
            placeholder="Optional"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="City"
            value={values.city}
            onChangeText={set("city")}
            maxLength={LIMITS.city}
            placeholder="Islamabad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="District / tehsil"
            value={values.district}
            onChangeText={set("district")}
            maxLength={LIMITS.district}
            placeholder="Optional"
          />
        </View>
      </View>
      {fieldErrors.city ? <Text style={styles.error}>{fieldErrors.city}</Text> : null}

      <Field
        label="Sector"
        value={values.sector}
        onChangeText={set("sector")}
        maxLength={LIMITS.sector}
        placeholder="G-11, F-8 — Islamabad only"
      />

      <Field
        label="Permanent address"
        value={values.permanentAddress}
        onChangeText={set("permanentAddress")}
        maxLength={LIMITS.permanentAddress}
        multiline
        placeholder="Optional — if different from above"
      />

      <View style={{ marginTop: spacing.md }}>
        <Note icon="location-outline">
          Your address decides which authority receives your reports. It is never shown on a
          public issue page.
        </Note>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Continue" onPress={() => void submit()} busy={busy} disabled={!ready} />
      </View>
    </RegistrationShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  fromCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  fromCardText: { fontSize: 12, fontWeight: "600", color: colors.civic700 },
  error: { marginTop: -spacing.sm, marginBottom: spacing.md, fontSize: 12, color: colors.danger },
});
