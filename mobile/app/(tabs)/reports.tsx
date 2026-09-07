import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuery } from "@/api/hooks";
import type { TrackedReport, TrackingSummary } from "@/api/types";
import { StatusProgress } from "@/civic/status-progress";
import { deriveStatus, statusPresentation } from "@/civic/status";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { colors, formatDate, radius, spacing, STAT_TONES } from "@/theme";

interface TrackingPayload {
  summary: TrackingSummary;
  reports: TrackedReport[];
}

/*
 * "My reports" — the web's /dashboard/reports, as its own screen.
 *
 * Separate from Home for the same reason the web separates them: the
 * dashboard answers "what's happening right now", this answers "what did I
 * ever report, and where did it get to". Search filters the citizen's OWN
 * already-scoped list — it can only ever narrow what is already theirs, never
 * widen it.
 */
export default function MyReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tracking = useQuery<TrackingPayload>("/api/citizen/tracking");
  const [query, setQuery] = React.useState("");

  const summary = tracking.data?.summary;
  const term = query.trim().toLowerCase();

  const reports = (tracking.data?.reports ?? []).filter((report) => {
    if (!term) return true;
    const haystack = [
      report.issue?.issueCode,
      report.issue?.title,
      report.title,
      report.locationLabel,
      report.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  if (tracking.loading && !tracking.data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.reportId}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl refreshing={tracking.loading} onRefresh={tracking.refresh} />
        }
        ListHeaderComponent={
          <View>
            {tracking.error ? <ErrorNote message={tracking.error} /> : null}

            <Text style={styles.title}>My reports</Text>
            <Text style={styles.subtitle}>
              Track what happened to every problem you reported.
            </Text>

            {summary ? (
              <View style={styles.statStrip}>
                <Strip tone="danger" label="Reported" value={summary.reported} />
                <Strip tone="warning" label="In process" value={summary.inProcess} />
                <Strip tone="success" label="Resolved" value={summary.resolved} />
              </View>
            ) : null}

            <View style={styles.search}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search — issue ID, place or title"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoCorrect={false}
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title={term ? "Nothing matched that search" : "No reports yet"}
            detail={
              term
                ? "Try a different issue ID, place or title."
                : "When you report a problem, it appears here so you can follow what happens to it."
            }
          />
        }
        renderItem={({ item }) => {
          const issue = item.issue;

          /*
           * The same colour, at a glance, as the stat tile it will fall
           * under above — real derivation (`deriveStatus`), not a colour
           * picked to match the label text. A report with no issue yet has
           * nothing to derive a status FROM, so it gets no accent at all
           * rather than a guessed one.
           */
          const accentColor = issue
            ? statusPresentation(deriveStatus(issue)).color
            : colors.lineStrong;

          return (
            <Pressable
              accessibilityRole="button"
              disabled={issue === null}
              onPress={() => issue && router.push(`/report/${issue.issueCode}`)}
              style={[
                styles.card,
                { borderLeftColor: accentColor },
                issue === null && { opacity: 0.7 },
              ]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code}>
                  {issue?.issueCode ??
                    (item.reportStatus === "ready_for_submission" ? "Being routed" : "Draft — not submitted")}
                </Text>
                <Text style={styles.date}>{formatDate(item.submittedAt)}</Text>
              </View>

              <Text style={styles.cardTitle}>{issue?.title ?? item.title ?? "Your report"}</Text>
              {item.locationLabel ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={colors.muted} />
                  <Text style={styles.meta}>{item.locationLabel}</Text>
                </View>
              ) : null}

              {issue ? (
                <>
                  <View style={{ marginTop: spacing.md }}>
                    <StatusProgress stageName={issue.stageName} isResolved={issue.isResolved} />
                  </View>

                  {issue.reportCount > 1 ? (
                    <View style={styles.groupRow}>
                      <Ionicons name="people" size={13} color={colors.civic700} />
                      <Text style={styles.groupText}>
                        {issue.reportCount} citizens reported this
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.dept}>
                    {issue.departmentName
                      ? `${issue.departmentName} · ${issue.orgName}`
                      : "Awaiting department assignment"}
                  </Text>

                  {/*
                    A provisional AI grouping is never presented as certain —
                    the citizen is told it might not belong here yet.
                  */}
                  {issue.needsReview ? (
                    <Text style={styles.provisional}>Provisionally grouped with this issue</Text>
                  ) : null}
                </>
              ) : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

/**
 * Icon-chip stat tile, matching the Home dashboard exactly — same
 * `STAT_TONES` palette, so the red/amber/green a citizen learns on one
 * screen already means the same thing on the other.
 */
function Strip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONES;
}) {
  const palette = STAT_TONES[tone];
  return (
    <View style={[styles.strip, { backgroundColor: palette.bg }]}>
      <View style={[styles.stripIcon, { backgroundColor: palette.fg }]}>
        <Ionicons name={palette.icon} size={13} color={colors.white} />
      </View>
      <Text style={[styles.stripValue, { color: palette.fg }]}>{value}</Text>
      <Text style={styles.stripLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 14, color: colors.muted },
  statStrip: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  strip: { flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: "center" },
  stripIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  stripValue: { fontSize: 20, fontWeight: "800" },
  stripLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.civic700 },
  date: { fontSize: 11, color: colors.muted },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.md },
  groupText: { fontSize: 13, fontWeight: "700", color: colors.civic700 },
  dept: { fontSize: 12, color: colors.muted, marginTop: 4 },
  provisional: { fontSize: 12, color: colors.amber700, marginTop: 4 },
});
