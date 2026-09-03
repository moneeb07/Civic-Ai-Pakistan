import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useQuery } from "@/api/hooks";
import type { ClarificationThread, TrackedReport, TrackingSummary } from "@/api/types";
import { Empty, ErrorNote, Loading, Pill } from "@/components/ui";
import { colors, formatDate, radius, spacing } from "@/theme";

interface TrackingPayload {
  summary: TrackingSummary;
  reports: TrackedReport[];
}

/** The citizen face: what I reported, and anything a department is waiting on. */
export function CitizenHome() {
  const router = useRouter();
  const tracking = useQuery<TrackingPayload>("/api/citizen/tracking");
  const clarifications = useQuery<ClarificationThread[]>("/api/citizen/clarifications");

  const awaiting = (clarifications.data ?? []).filter((thread) => thread.unreadForCitizen > 0);

  if (tracking.loading && !tracking.data) return <Loading />;

  return (
    <FlatList
      data={tracking.data?.reports ?? []}
      keyExtractor={(item) => item.reportId}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={tracking.loading}
          onRefresh={() => {
            tracking.refresh();
            clarifications.refresh();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          {tracking.error ? <ErrorNote message={tracking.error} /> : null}

          {/*
            A department waiting on an answer is the only thing here that blocks
            somebody else's work, so it sits above the report list rather than
            being left to be discovered.
          */}
          {awaiting.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/messages")}
              style={styles.prompt}
            >
              <Text style={styles.promptTitle}>
                {awaiting.length === 1
                  ? "A department has a question for you"
                  : `${awaiting.length} departments have questions for you`}
              </Text>
              <Text style={styles.promptDetail}>Answering helps them fix it faster.</Text>
            </Pressable>
          ) : null}

          <Text style={styles.heading}>Your reports</Text>
        </View>
      }
      ListEmptyComponent={
        <Empty
          title="Nothing reported yet"
          detail="When you report a problem, you can follow what the department does about it here."
        />
      }
      renderItem={({ item }) => {
        /*
         * A report only gets an issue once the intake pipeline has grouped it,
         * so a very recent one has no code and nothing to open yet. It is still
         * listed — the citizen sent it, and it must not appear to have vanished.
         */
        const issue = item.issue;

        return (
          <Pressable
            accessibilityRole="button"
            disabled={issue === null}
            onPress={() => issue && router.push(`/report/${issue.issueCode}`)}
            style={[styles.card, issue === null && { opacity: 0.7 }]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.code}>{issue?.issueCode ?? "Being processed"}</Text>
              <Pill
                tone={issue?.isResolved ? "civic" : "warn"}
                text={
                  issue === null
                    ? "Received"
                    : issue.isResolved
                      ? "Resolved"
                      : (issue.stageName ?? "With the department")
                }
              />
            </View>
            <Text style={styles.cardTitle}>{issue?.title ?? item.title ?? "Your report"}</Text>
            {item.locationLabel ? <Text style={styles.meta}>{item.locationLabel}</Text> : null}
            <Text style={styles.meta}>Reported {formatDate(item.submittedAt)}</Text>
            {issue && issue.reportCount > 1 ? (
              <Text style={styles.meta}>
                {issue.reportCount} people reported this
              </Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  prompt: {
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic100,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  promptTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  promptDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
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
