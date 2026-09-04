import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useQuery } from "@/api/hooks";
import type {
  GovOverviewPayload,
  IssueSummary,
  Notification,
  PeerPerformance,
  PeerRow,
} from "@/api/types";
import { Empty, ErrorNote, Loading, Pill } from "@/components/ui";
import { colors, formatDate, radius, spacing } from "@/theme";

interface NotificationsPayload {
  items: Notification[];
  unread: number;
}

/*
 * The officer dashboard, and it is four dashboards in one.
 *
 * What changes by role is not the layout but the SCOPE of every number, and
 * the scope is decided server-side from the officer's own record — a platform
 * admin's tiles cover every organisation, a member's cover only their
 * department. The client never asks for a scope, so it cannot ask for one it
 * is not entitled to.
 *
 * The peer table underneath answers the question each role actually has:
 *
 *   platform admin -> which ORGANISATION is doing better
 *   org head       -> which DEPARTMENT is doing better
 *   dept head      -> which MEMBER is carrying what
 *   member         -> nothing; a member manages nobody, so it is absent
 */
export function OfficerHome() {
  const router = useRouter();
  const issues = useQuery<IssueSummary[]>("/api/gov/issues");
  const notifications = useQuery<NotificationsPayload>("/api/gov/notifications");
  const stats = useQuery<GovOverviewPayload>("/api/gov/overview");
  const peers = useQuery<PeerPerformance>("/api/gov/peer-performance");

  const unread = notifications.data?.unread ?? 0;
  const overview = stats.data?.overview;
  const peerRows = peers.data?.rows ?? [];

  if (issues.loading && !issues.data) return <Loading />;

  return (
    <FlatList
      data={issues.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={issues.loading}
          onRefresh={() => {
            issues.refresh();
            notifications.refresh();
            stats.refresh();
            peers.refresh();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          {issues.error ? <ErrorNote message={issues.error} /> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            onPress={() => router.push("/notifications")}
            style={styles.inbox}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.civic700} />
            <Text style={styles.inboxLabel}>Notifications</Text>
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>

          {/* Same four figures the web operations dashboard leads with. */}
          {overview ? (
            <View style={styles.statGrid}>
              <Stat label="Reports" value={overview.reports} hint="Citizen submissions" />
              <Stat label="Issues" value={overview.issues} hint="Real problems" />
              <Stat label="In process" value={overview.inProcess} hint="Being worked on" tint="#c2790a" />
              <Stat label="Resolved" value={overview.resolved} hint="Closed out" emphasis />
            </View>
          ) : null}

          {overview && overview.unrouted > 0 ? (
            <View style={styles.unrouted}>
              <Ionicons name="alert-circle" size={16} color={colors.amber700} />
              <Text style={styles.unroutedText}>
                {overview.unrouted} {overview.unrouted === 1 ? "issue" : "issues"} awaiting routing
              </Text>
            </View>
          ) : null}

          {/* The comparative table — absent entirely for a member. */}
          {peers.data && peers.data.level !== "none" && peerRows.length > 0 ? (
            <View style={styles.peerCard}>
              <View style={styles.peerHead}>
                <Ionicons name="trophy-outline" size={16} color={colors.civic700} />
                <Text style={styles.peerTitle}>{peers.data.label} by resolution rate</Text>
              </View>

              {peerRows.map((row) => (
                <PeerRowView key={row.id} row={row} level={peers.data!.level} />
              ))}

              <Text style={styles.peerNote}>
                {peers.data.level === "member"
                  ? "Workload and outcomes, not a performance verdict — caseloads differ and a hard complaint takes longer than an easy one. Treat it as a prompt to ask why."
                  : "Rates are adjusted toward the average so a small caseload cannot top the table on a handful of issues."}
              </Text>
            </View>
          ) : null}

          <Text style={styles.heading}>Issues</Text>
        </View>
      }
      ListEmptyComponent={
        <Empty
          title="No issues yet"
          detail="Issues appear here once citizen reports are grouped and routed to your department."
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/issue/${item.issueCode}`)}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <Text style={styles.code}>{item.issueCode}</Text>
            {/*
              The grouped-report count is the number that changes how an officer
              prioritises: eleven people reporting one thing is not the same
              piece of work as one person reporting it.
            */}
            {item.reportCount > 1 ? (
              <Pill tone="civic" text={`${item.reportCount} reports`} />
            ) : null}
            {item.deptName === null ? <Pill tone="warn" text="Not routed" /> : null}
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.locationLabel ? <Text style={styles.meta}>{item.locationLabel}</Text> : null}
          <Text style={styles.meta}>
            {item.deptName ?? "Awaiting routing"} · {formatDate(item.createdAt)}
          </Text>
        </Pressable>
      )}
    />
  );
}

function PeerRowView({ row, level }: { row: PeerRow; level: string }) {
  return (
    <View style={styles.peerRow}>
      <View style={[styles.peerRank, !row.ranked && { backgroundColor: colors.line }]}>
        <Text style={[styles.peerRankText, !row.ranked && { color: colors.muted }]}>
          {row.ranked ? row.rank : "—"}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.peerName} numberOfLines={1}>
          {row.name}
        </Text>
        {/* A rate never appears without its denominator. */}
        <Text style={styles.peerDenominator}>
          {row.resolved} of {row.totalIssues} resolved
          {row.openIssues > 0 ? ` · ${row.openIssues} open` : ""}
          {!row.ranked ? " · too few to rank" : ""}
        </Text>
        <View style={styles.peerMeterTrack}>
          <View
            style={[
              styles.peerMeterFill,
              { width: `${Math.min(100, Math.max(0, row.resolutionRate))}%` },
              !row.ranked && { backgroundColor: colors.lineStrong },
            ]}
          />
        </View>
      </View>

      <Text style={styles.peerRate}>{row.resolutionRate}%</Text>
    </View>
  );
}

function Stat({
  label,
  value,
  hint,
  tint,
  emphasis,
}: {
  label: string;
  value: number;
  hint: string;
  tint?: string;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.stat, emphasis && styles.statEmphasis]}>
      <Text style={[styles.statLabel, emphasis && { color: "rgba(255,255,255,0.75)" }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.statValue, tint ? { color: tint } : null, emphasis && { color: colors.white }]}>
        {value}
      </Text>
      <Text style={[styles.statHint, emphasis && { color: "rgba(255,255,255,0.75)" }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  inbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  inboxLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: "700" },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  stat: {
    width: "48%",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statEmphasis: { backgroundColor: colors.civic600, borderColor: colors.civic600 },
  statLabel: { fontSize: 10, fontWeight: "700", color: colors.muted, letterSpacing: 0.4 },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: colors.ink },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 1 },

  unrouted: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.amber100,
  },
  unroutedText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.amber700 },

  peerCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  peerHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  peerTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.ink },
  peerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  peerRank: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  peerRankText: { fontSize: 12, fontWeight: "800", color: colors.civic700 },
  peerName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  peerDenominator: { fontSize: 11, color: colors.muted, marginTop: 1 },
  peerMeterTrack: {
    height: 5,
    marginTop: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  peerMeterFill: { height: "100%", backgroundColor: "#0b8f6a", borderRadius: radius.pill },
  peerRate: { fontSize: 14, fontWeight: "800", color: colors.ink, minWidth: 46, textAlign: "right" },
  peerNote: { marginTop: spacing.md, fontSize: 11, lineHeight: 16, color: colors.muted },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.civic700 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: spacing.sm },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
