import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/context/session";
import { CitizenHome } from "@/screens/citizen-home";
import { OfficerHome } from "@/screens/officer-home";
import { Loading, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * The one screen that is both apps.
 *
 * Sign-out moved to the Account tab: it does not belong one mis-tap away from
 * the content, and it needs to be reachable from anywhere, not just here.
 *
 * A citizen sees their reports. An officer sees their department's issues. An
 * officer who is also reporting a pothole outside their own house flicks the
 * switch — same session, same account, different view.
 */
export default function HomeScreen() {
  const { me, loading, mode, setMode } = useSession();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!me) return <Redirect href="/welcome" />;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{me.user.name}</Text>
          <Text style={styles.subtitle}>
            {mode === "officer" && me.officer.available
              ? (me.officer.deptName ?? me.officer.orgName ?? "Government portal")
              : "Citizen"}
          </Text>
        </View>

      </View>

      {/*
        The switch only appears for accounts that actually have both. Showing a
        disabled officer tab to every citizen would advertise a door they can
        never open.
      */}
      {me.canSwitch ? (
        <View style={styles.switcher}>
          {(["citizen", "officer"] as const).map((option) => {
            const active = mode === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(option)}
                style={[styles.switchTab, active && styles.switchTabActive]}
              >
                <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>
                  {option === "citizen" ? "My reports" : "Department"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mode === "officer" && me.officer.available ? <OfficerHome /> : <CitizenHome />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 1 },
  switcher: {
    flexDirection: "row",
    gap: spacing.xs,
    margin: spacing.lg,
    marginBottom: 0,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  switchTab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  switchTabActive: { backgroundColor: colors.surface },
  switchLabel: { fontSize: 14, fontWeight: "600", color: colors.muted },
  switchLabelActive: { color: colors.ink },
});
