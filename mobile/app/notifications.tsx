import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { Notification } from "@/api/types";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { colors, formatDateTime, radius, spacing } from "@/theme";

interface NotificationsPayload {
  items: Notification[];
  unread: number;
}

/*
 * The officer's inbox.
 *
 * Every entry carries its issue code and opens the exact conversation the
 * officer was named in. That is the whole point of the mention feature: a
 * colleague writes "@Ahmed can you check the valve" and Ahmed arrives at that
 * sentence, rather than at a dashboard he then has to search.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { data, error, loading, refresh } = useQuery<NotificationsPayload>(
    "/api/gov/notifications",
  );
  const [read, setRead] = React.useState<string[]>([]);

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  function open(item: Notification) {
    if (!item.readAt && !read.includes(item.id)) {
      setRead((current) => [...current, item.id]);
      // Best effort: a failed read-marking must never block navigation.
      void api(`/api/gov/notifications/${item.id}/read`, { method: "POST" }).catch(
        () => undefined,
      );
    }

    if (!item.issueCode) return;
    router.push(
      item.conversationId
        ? `/conversation/${item.conversationId}?issue=${item.issueCode}`
        : `/issue/${item.issueCode}`,
    );
  }

  return (
    <Screen>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ListHeaderComponent={error ? <ErrorNote message={error} /> : null}
        ListEmptyComponent={
          <Empty
            title="Nothing yet"
            detail="You'll be notified here when a colleague mentions you, or a citizen answers your question."
          />
        }
        renderItem={({ item }) => {
          const isUnread = !item.readAt && !read.includes(item.id);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(item)}
              style={[styles.card, isUnread && styles.cardUnread]}
            >
              <View style={styles.top}>
                {item.issueCode ? <Text style={styles.code}>{item.issueCode}</Text> : null}
                <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardUnread: { borderColor: colors.civic100, backgroundColor: colors.civic50 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.civic700 },
  time: { fontSize: 12, color: colors.muted },
  title: { fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: spacing.sm },
  body: { fontSize: 14, color: colors.muted, marginTop: 2, lineHeight: 20 },
});
