import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useQuery } from "@/api/hooks";
import type { IssueSummary, Notification } from "@/api/types";
import { Empty, ErrorNote, Loading, Pill } from "@/components/ui";
import { colors, formatDate, radius, spacing } from "@/theme";

interface NotificationsPayload {
  items: Notification[];
  unread: number;
}

/** The officer face: what my department is carrying, and who has pinged me. */
export function OfficerHome() {
  const router = useRouter();
  const issues = useQuery<IssueSummary[]>("/api/gov/issues");
  const notifications = useQuery<NotificationsPayload>("/api/gov/notifications");

  const unread = notifications.data?.unread ?? 0;

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
          }}
        />
      }
      ListHeaderComponent={
        <View>
          {issues.error ? <ErrorNote message={issues.error} /> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
            onPress={() => router.push("/notifications")}
            style={styles.inbox}
          >
            <Text style={styles.inboxLabel}>Notifications</Text>
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>

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
