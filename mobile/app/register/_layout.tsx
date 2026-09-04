import { Stack } from "expo-router";

import { RegistrationProvider } from "@/registration/context";
import { colors } from "@/theme";

/*
 * The signup flow.
 *
 * Every screen draws its own header (the brand plus the progress bar), so the
 * stack's own header is off throughout — two headers stacked on a phone would
 * eat a third of the screen on the forms that need it most.
 *
 * The provider sits here rather than at the app root so that leaving the flow
 * genuinely discards it: an abandoned half-registration, and the password
 * chosen part-way through it, should not outlive the screens that collected
 * them.
 */
export default function RegisterLayout() {
  return (
    <RegistrationProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </RegistrationProvider>
  );
}
