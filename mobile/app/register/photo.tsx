import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { registrationStep } from "@/api/client";
import { useRegistration } from "@/registration/context";
import { RegistrationShell, StepHeading, Note } from "@/registration/shell";
import { Button, ErrorNote } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * A profile photograph — optional, and genuinely so.
 *
 * The step can be skipped and the account is complete without it, which is why
 * the secondary action says "Skip for now" rather than hiding behind a small
 * link. A citizen with no photograph of themselves must not be stopped from
 * reporting a burst water main.
 *
 * Size is the thing to get right here. The server rejects anything over about
 * 1MB of image (1.4MB of base64), and a raw 12-megapixel selfie is several
 * times that — so the picker is asked for a square crop at reduced quality,
 * and the result is measured before it is sent. A citizen who hits the cap is
 * told plainly and asked for a smaller picture, rather than being handed a
 * validation error from a schema they cannot see.
 */

/** Matches profilePhotoSchema in src/lib/registration/schema.ts. */
const MAX_BASE64 = 1_400_000;

/*
 * A profile photograph is displayed at about 40 pixels square, so there is
 * nothing to gain from sending more than this. Asking the picker for a square
 * crop at reduced quality clears the server's cap comfortably.
 */
const QUALITY = 0.4;

export default function PhotoScreen() {
  const router = useRouter();
  const { setDraft } = useRegistration();

  const [image, setImage] = React.useState<string | null>(null); // data URL
  const [preview, setPreview] = React.useState<string | null>(null); // file URI
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function pick(source: "camera" | "library") {
    setError(null);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "CivicAI needs the camera to take your photograph."
            : "CivicAI needs access to your photos.",
        );
        return;
      }

      const options = {
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        base64: true,
        quality: QUALITY,
      };

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        setError("That image could not be read. Please try another photo.");
        return;
      }

      /*
       * Checked here rather than left to the server, so an oversized picture
       * is a sentence the citizen can act on instead of a schema error. Only
       * one capture is ever asked for — re-opening the camera to retry at a
       * lower quality would make someone photograph themselves three times.
       */
      if (asset.base64.length > MAX_BASE64) {
        setError("That photo is too large. Please choose a smaller one, or skip this step.");
        return;
      }

      setPreview(asset.uri);
      setImage(`data:image/jpeg;base64,${asset.base64}`);
    } catch {
      setError("That image could not be read. Please try another photo.");
    }
  }

  async function submit(withImage: boolean) {
    setBusy(true);
    setError(null);

    const payload = await registrationStep("/api/registration/step", {
      step: "photo",
      values: withImage && image ? { image } : null,
    });

    setBusy(false);

    if (!payload.success) {
      setError(payload.message ?? "That photo could not be saved.");
      return;
    }

    setDraft({ hasPhoto: withImage && Boolean(image) });
    router.push("/register/confirm");
  }

  return (
    <RegistrationShell step="photo">
      <StepHeading
        title="Add a photo"
        subtitle="It appears on your profile so officers can see who they are talking to. You can skip this."
      />

      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.previewWrap}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.placeholder]}>
            <Ionicons name="person" size={44} color={colors.civic200} />
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void pick("camera")}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="camera-outline" size={19} color={colors.civic700} />
          <Text style={styles.actionText}>Take a photo</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => void pick("library")}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="images-outline" size={19} color={colors.civic700} />
          <Text style={styles.actionText}>Choose one</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Note icon="eye-off-outline">
          Your photo is shown to the officers handling your reports. It is never attached to a
          public issue page.
        </Note>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={image ? "Continue" : "Continue without a photo"}
          onPress={() => void submit(true)}
          busy={busy}
        />
        {image ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Skip for now" variant="quiet" onPress={() => void submit(false)} />
          </View>
        ) : null}
      </View>
    </RegistrationShell>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: "center" },
  preview: { width: 132, height: 132, borderRadius: radius.pill, backgroundColor: colors.civic50 },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  actionText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  pressed: { opacity: 0.75 },
});
