import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useQuery } from "@/api/hooks";
import type { CitizenIssueDetail } from "@/api/types";
import { Empty, ErrorNote, Loading, Pill, Screen } from "@/components/ui";
import { colors, formatDate, radius, spacing } from "@/theme";

/*
 * What happened to something I reported.
 *
 * Shows the department's own workflow stages rather than a fixed three-step
 * status, because each department defines what its stages are — a water board's
 * "Valve isolated" is real progress that a generic "In progress" would hide.
 */
export default function TrackedReportScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data, error, loading } = useQuery<CitizenIssueDetail>(
    code ? `/api/citizen/tracking/${encodeURIComponent(code)}` : null,
  );

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        {error ? <ErrorNote message={error} /> : null}
        <Empty title="Report not found" detail="This report is not one of yours, or was removed." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Text style={styles.code}>{data.issueCode}</Text>
          <Pill
            tone={data.isResolved ? "civic" : "warn"}
            text={data.isResolved ? "Resolved" : (data.stageName ?? "Received")}
          />
        </View>

        <Text style={styles.title}>{data.title}</Text>
        {data.locationLabel ? <Text style={styles.meta}>{data.locationLabel}</Text> : null}
        <Text style={styles.meta}>
          {data.departmentName ?? data.orgName} · Reported {formatDate(data.createdAt)}
        </Text>

        {/*
          Said plainly rather than buried: a citizen whose report was merged
          into a bigger one should be told that is why they see a shared code.
        */}
        {data.reportCount > 1 ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>
              {data.reportCount} people reported this same problem. They are being handled together
              as one case.
            </Text>
          </View>
        ) : null}

        {data.description ? <Text style={styles.description}>{data.description}</Text> : null}

        <Text style={styles.heading}>Progress</Text>
        {data.timeline.length === 0 ? (
          <Text style={styles.meta}>
            Your report has been received and is waiting to be picked up by a department.
          </Text>
        ) : (
          <View style={styles.timeline}>
            {data.timeline.map((entry, index) => (
              <View key={`${entry.stageName}-${entry.at}`} style={styles.entry}>
                <View
                  style={[
                    styles.dot,
                    index === data.timeline.length - 1 && { backgroundColor: colors.civic600 },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stage}>{entry.stageName}</Text>
                  <Text style={styles.meta}>{formatDate(entry.at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.civic700 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: spacing.sm },
  meta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  description: { fontSize: 15, lineHeight: 22, color: colors.ink, marginTop: spacing.lg },
  note: {
    backgroundColor: colors.civic50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: { fontSize: 13, lineHeight: 19, color: colors.civic700 },
  heading: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: spacing.xl },
  timeline: { marginTop: spacing.md, gap: spacing.lg },
  entry: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.lineStrong, marginTop: 5 },
  stage: { fontSize: 15, fontWeight: "600", color: colors.ink },
});
