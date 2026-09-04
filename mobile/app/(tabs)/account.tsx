import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuery } from "@/api/hooks";
import type { CitizenProfile } from "@/api/types";
import { useSession } from "@/context/session";
import { Loading, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Profile — matching the web's /dashboard/profile.
 *
 * Read-only, exactly as the web is: this displays what registration captured,
 * it does not edit it. The one difference is that mobile also carries the
 * officer/citizen view switch and sign-out here, because there is no sidebar
 * or top bar to put them in.
 *
 * The CNIC is shown masked and only masked. The real number never leaves the
 * server — not even to the citizen it belongs to.
 */
export default function ProfileScreen() {
  const { me, mode, setMode, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: profile, loading } = useQuery<CitizenProfile>("/api/citizen/profile");
  const [busy, setBusy] = React.useState(false);

  if (!me) return null;

  const officer = me.officer.available ? me.officer : null;

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      router.replace("/welcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <View style={styles.identityHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.fullName ?? me.user.name).trim().charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile?.fullName ?? me.user.name}</Text>
            <Text style={styles.city}>
              {profile?.city ? `${profile.city}, Pakistan` : me.user.email}
            </Text>
            <View style={styles.activePill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.civic700} />
              <Text style={styles.activePillText}>Active</Text>
            </View>
          </View>
        </View>

        {officer ? (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={13} color={colors.civic700} />
            <Text style={styles.roleBadgeText}>
              {officer.deptName ?? officer.orgName ?? "Authority staff"}
            </Text>
          </View>
        ) : null}

        {/*
          Offered only to accounts that genuinely have both faces. Showing a
          disabled "Department" option to every citizen would advertise a door
          that will never open for them.
        */}
        {me.canSwitch ? (
          <Section title="View">
            <Text style={styles.sectionBody}>
              Switching changes what you see, never what you may do — the server decides that from
              your account on every request.
            </Text>
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
          </Section>
        ) : null}

        {loading && !profile ? <Loading /> : null}

        {profile ? (
          <>
            <Section
              title="Identity information"
              badge={profile.identitySource === "cnic_scan" ? "Extracted from CNIC" : "Entered manually"}
            >
              <Row label="Full name" value={profile.fullName} />
              <Row label="Father / husband" value={profile.fatherName} />
              <Row label="CNIC" value={profile.cnicMasked} mono />
              <Row label="Date of birth" value={profile.dateOfBirth} />
              <Row label="Gender" value={profile.gender} />
            </Section>

            <Section title="Contact">
              <Row label="Mobile" value={profile.phone} mono />
              <Row label="Email" value={profile.email} mono />
            </Section>

            <Section title="Address">
              <Row label="House / flat" value={profile.houseNumber} />
              <Row label="City" value={profile.city} />
              <Row label="District" value={profile.district} />
              <Row label="Address" value={combinedAddress(profile)} />
              {profile.permanentAddress ? (
                <Row label="Permanent" value={profile.permanentAddress} />
              ) : null}
            </Section>

            <Section title="Account">
              <Row label="Member since" value={formatMemberSince(profile.createdAt)} />
              <Row label="Status" value="Active" />
              <Row label="Voice guidance" value={profile.assistedMode ? "On" : "Off"} />
            </Section>
          </>
        ) : null}

        {/*
          The administrative chain — create the tier below you, invite whoever
          will run it. Shown only to officers who can actually issue an
          invitation; a member manages nobody, so it stays hidden for them.
        */}
        {officer && officer.role !== "member" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/manage")}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="settings-outline" size={18} color={colors.civic700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Manage</Text>
              <Text style={styles.linkBody}>
                {officer.role === "platform_admin"
                  ? "Organisations and their heads"
                  : officer.role === "org_head"
                    ? "Departments and their heads"
                    : "Members of your department"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ) : null}

        {/*
          The web keeps "Authority performance" in the citizen sidebar. It has
          no tab of its own here — it is read rarely, and a tab costs every
          citizen a permanent thumb target — so it sits where the other
          account-level destinations are.
        */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/performance")}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="bar-chart-outline" size={18} color={colors.civic700} />
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Authority performance</Text>
            <Text style={styles.linkBody}>How every authority is doing — public figures</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.signOutText}>{busy ? "Signing out…" : "Sign out"}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

/*
 * The street-level lines that don't already have their own row, joined once.
 * Mirrors the web's de-duplication note: without this the card reads
 * "House 1, House 1, Street 1…" because houseNumber and city are shown above.
 */
function combinedAddress(profile: CitizenProfile): string | null {
  const parts = [profile.street, profile.road, profile.sector, profile.residentialAddress]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join(", ") : null;
}

/** Fixed to Pakistan time, like the web — never the phone's timezone. */
function formatMemberSince(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        {badge ? (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={3}>
        {value?.trim() ? value : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identityHeader: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.civic100,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: colors.civic700 },
  name: { fontSize: 20, fontWeight: "800", color: colors.ink },
  city: { marginTop: 2, fontSize: 13, color: colors.muted },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
  },
  activePillText: { fontSize: 11, fontWeight: "700", color: colors.civic700 },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.lg,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  roleBadgeText: { fontSize: 12, fontWeight: "600", color: colors.civic700 },

  section: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 },
  sectionBody: { fontSize: 13, lineHeight: 19, color: colors.muted },
  sourceBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: "700", color: colors.civic700 },

  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 7 },
  rowLabel: { width: 120, fontSize: 13, color: colors.muted },
  rowValue: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.ink },
  rowValueMono: { fontVariant: ["tabular-nums"] },

  switcher: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
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

  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  linkTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  linkBody: { marginTop: 2, fontSize: 12, color: colors.muted },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  signOutText: { fontSize: 15, fontWeight: "600", color: colors.danger },
});
