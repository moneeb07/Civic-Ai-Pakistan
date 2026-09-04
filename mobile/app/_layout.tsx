import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/context/session";
import { colors } from "@/theme";

/*
 * Two layers of navigation, on purpose.
 *
 * The signed-out screens (welcome, sign-in, redeem) and the detail screens
 * (an issue, a discussion, one report) are STACK screens: each is a single
 * destination you arrive at and come back from.
 *
 * Everything you return to repeatedly lives in `(tabs)`, behind a bottom bar.
 * The parentheses make it a route GROUP — it adds no URL segment, so the tab
 * screens are still /home, /messages and /notifications and every existing
 * link keeps working.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontSize: 16, fontWeight: "600" },
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="redeem" options={{ title: "Redeem an invitation" }} />
          {/* Signup draws its own header on every step — see app/register/_layout.tsx. */}
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="issue/[code]" options={{ title: "Issue" }} />
          <Stack.Screen name="conversation/[id]" options={{ title: "Discussion" }} />
          <Stack.Screen name="report/[code]" options={{ title: "Your report" }} />
          <Stack.Screen name="performance" options={{ headerShown: false }} />
          <Stack.Screen name="complaint/[reportId]" options={{ title: "Complaint" }} />
          <Stack.Screen name="manage" options={{ title: "Manage" }} />
          {/* The report-creation wizard draws its own header — see app/report/new/_layout.tsx. */}
          <Stack.Screen name="report/new" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
