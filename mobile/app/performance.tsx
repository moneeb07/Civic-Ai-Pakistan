import * as React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuery } from "@/api/hooks";
import type { AuthorityPerformance, PerformanceSummary } from "@/api/types";
import { statusPresentation } from "@/civic/status";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

interface PerformancePayload {
  authorities: AuthorityPerformance[];
  summary: PerformanceSummary;
}

/*
 * Authority performance — the public accountability page.
 *
 * Two rules carried over from the web verbatim, because they are the whole
 * point of the page rather than styling choices:
 *
 *   1. A rate never appears without its denominator. "90%" beside "18 of 20"
 *      is accountability; "90%" alone is a number an authority can game.
 *   2. An authority with too small a caseload to judge is shown with its real
 *      figures but NOT given a rank — listed separately, explicitly labelled,
 *      rather than flattering it with a position it hasn't earned.
 *
 * The ranking itself is computed server-side (Bayesian shrinkage toward the
 * national average). This screen renders that answer; it does not recompute
 * it, so phone and laptop can never disagree about who is first.
 */
export default function PerformanceScreen() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, refresh } = useQuery<PerformancePayload>("/api/performance");

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const summary = data?.summary;
  const ranked = (data?.authorities ?? []).filter((a) => a.ranked);
  const unranked = (data?.authorities ?? []).filter((a) => !a.ranked);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl * 2,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <View style={styles.openDataPill}>
          <Ionicons name="earth" size={12} color={colors.civic700} />
          <Text style={styles.openDataText}>Open data · updated continuously</Text>
        </View>

        <Text style={styles.title}>Authority performance</Text>
        <Text style={styles.subtitle}>
          How every authority on CivicAI is doing, published without an account.
        </Text>

        {error ? <ErrorNote message={error} /> : null}

        {summary && data && data.authorities.length > 0 ? (
          <>
            <View style={styles.statGrid}>
              <Stat label="Citizen reports" value={summary.citizenReports} hint="Received" />
              <Stat label="Civic issues" value={summary.issues} hint="After AI grouping" />
              <Stat label="Resolved" value={summary.resolved} hint={`of ${summary.issues}`} />
              <Stat
                label="Resolution rate"
                value={`${summary.resolutionRate}%`}
                hint="Across all authorities"
                emphasis
              />
            </View>

            {/*
              The status split. A stacked bar rather than a donut — but the
              legend still spells out every count, because colour alone is
              never allowed to carry a number on this page.
            */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Where every issue stands</Text>
              <View style={styles.stackBar}>
                <Segment value={summary.resolved} total={summary.issues} status="RESOLVED" />
                <Segment value={summary.inProcess} total={summary.issues} status="IN_PROCESS" />
                <Segment value={summary.reported} total={summary.issues} status="REPORTED" />
              </View>
              <View style={styles.legend}>
                <LegendRow status="RESOLVED" value={summary.resolved} />
                <LegendRow status="IN_PROCESS" value={summary.inProcess} />
                <LegendRow status="REPORTED" value={summary.reported} />
              </View>
            </View>

            <View style={styles.explainer}>
              <Ionicons name="information-circle-outline" size={16} color={colors.civic700} />
              <Text style={styles.explainerText}>
                Authorities are ranked on their resolution rate, adjusted toward the national
                average so a small caseload cannot top the table on a handful of issues.
              </Text>
            </View>

            {ranked.length > 0 ? (
              <>
                <Text style={styles.sectionHeading}>Ranked</Text>
                {ranked.map((authority) => (
                  <AuthorityCard key={authority.authorityId} authority={authority} />
                ))}
              </>
            ) : null}

            {unranked.length > 0 ? (
              <>
                <Text style={styles.sectionHeading}>Not enough data to rank</Text>
                <Text style={styles.sectionNote}>
                  Real figures, no position — too few issues to judge fairly yet.
                </Text>
                {unranked.map((authority) => (
                  <AuthorityCard key={authority.authorityId} authority={authority} muted />
                ))}
              </>
            ) : null}

            <Text style={styles.footnote}>
              &ldquo;Resolved&rdquo; means an issue reached its department&rsquo;s own final
              workflow stage. Each department defines what finished means for its work.
            </Text>
          </>
        ) : (
          <Empty
            title="No authorities yet"
            detail="Performance figures appear here once an authority is handling issues."
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function AuthorityCard({
  authority,
  muted,
}: {
  authority: AuthorityPerformance;
  muted?: boolean;
}) {
  return (
    <View style={[styles.authorityCard, muted && styles.authorityCardMuted]}>
      <View style={styles.authorityHead}>
        <View style={[styles.rankChip, muted && { backgroundColor: colors.line }]}>
          <Text style={[styles.rankChipText, muted && { color: colors.muted }]}>
            {authority.ranked ? authority.rank : "—"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorityName}>{authority.authorityName}</Text>
          <Text style={styles.authorityCode}>{authority.authorityCode}</Text>
        </View>
      </View>

      {/* The rate and its denominator, always together. */}
      <View style={styles.meterRow}>
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              { width: `${Math.min(100, Math.max(0, authority.resolutionRate))}%` },
            ]}
          />
        </View>
        <Text style={styles.meterValue}>{authority.resolutionRate}%</Text>
      </View>
      <Text style={styles.denominator}>
        {authority.resolved} of {authority.totalIssues} issues resolved
      </Text>

      <View style={styles.figures}>
        <Figure label="Open" value={authority.openIssues} />
        <Figure label="Issues" value={authority.totalIssues} />
        <Figure label="Reports" value={authority.citizenReports} />
      </View>
    </View>
  );
}

function Segment({
  value,
  total,
  status,
}: {
  value: number;
  total: number;
  status: Parameters<typeof statusPresentation>[0];
}) {
  if (total <= 0 || value <= 0) return null;
  return (
    <View
      style={{
        flex: value / total,
        backgroundColor: statusPresentation(status).color,
      }}
    />
  );
}

function LegendRow({
  status,
  value,
}: {
  status: Parameters<typeof statusPresentation>[0];
  value: number;
}) {
  const presentation = statusPresentation(status);
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: presentation.color }]} />
      <Text style={styles.legendLabel}>{presentation.label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.stat, emphasis && styles.statEmphasis]}>
      <Text style={[styles.statLabel, emphasis && { color: "rgba(255,255,255,0.75)" }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.statValue, emphasis && { color: colors.white }]}>{value}</Text>
      <Text style={[styles.statHint, emphasis && { color: "rgba(255,255,255,0.75)" }]}>{hint}</Text>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  openDataPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  openDataText: { fontSize: 11, fontWeight: "600", color: colors.civic700 },
  title: { marginTop: spacing.md, fontSize: 26, fontWeight: "800", color: colors.ink, letterSpacing: -0.6 },
  subtitle: { marginTop: spacing.sm, fontSize: 14, lineHeight: 21, color: colors.muted },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xl },
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
  statValue: { marginTop: 4, fontSize: 22, fontWeight: "800", color: colors.ink },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 1 },

  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.ink, marginBottom: spacing.md },
  stackBar: { flexDirection: "row", height: 12, borderRadius: radius.pill, overflow: "hidden", gap: 2 },
  legend: { marginTop: spacing.md, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: colors.muted },
  legendValue: { fontSize: 13, fontWeight: "700", color: colors.ink },

  explainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
  },
  explainerText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.civic700 },

  sectionHeading: { marginTop: spacing.xl, fontSize: 15, fontWeight: "700", color: colors.ink },
  sectionNote: { marginTop: 2, fontSize: 12, color: colors.muted },

  authorityCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  authorityCardMuted: { backgroundColor: colors.canvas },
  authorityHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rankChip: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
    alignItems: "center",
    justifyContent: "center",
  },
  rankChipText: { fontSize: 13, fontWeight: "800", color: colors.civic700 },
  authorityName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  authorityCode: { fontSize: 11, color: colors.muted, marginTop: 1 },

  meterRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  meterTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  meterFill: { height: "100%", backgroundColor: "#0b8f6a", borderRadius: radius.pill },
  meterValue: { fontSize: 13, fontWeight: "800", color: colors.ink, minWidth: 44, textAlign: "right" },
  denominator: { marginTop: 4, fontSize: 12, color: colors.muted },

  figures: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  figureValue: { fontSize: 15, fontWeight: "700", color: colors.ink },
  figureLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },

  footnote: { marginTop: spacing.xl, fontSize: 11, lineHeight: 17, color: colors.muted },
});
