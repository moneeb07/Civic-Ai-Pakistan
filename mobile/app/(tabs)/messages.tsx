import * as React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View, Pressable } from "react-native";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { ClarificationMessage, ClarificationThread } from "@/api/types";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { colors, formatDateTime, radius, spacing } from "@/theme";

/*
 * The citizen's side of a department's question.
 *
 * Deliberately the plainest screen in the app. Somebody asked "which pole?"
 * should be able to answer in one tap and one sentence — no case-handling
 * language, and no sign that the department's internal thread exists.
 */
export default function CitizenMessagesScreen() {
  const { data, error, loading, refresh } = useQuery<ClarificationThread[]>(
    "/api/citizen/clarifications",
  );

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={data ?? []}
        keyExtractor={(thread) => thread.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ListHeaderComponent={error ? <ErrorNote message={error} /> : null}
        ListEmptyComponent={
          <Empty
            title="No messages"
            detail="You'll see a message here if a department has a question about something you reported."
          />
        }
        renderItem={({ item }) => <Thread thread={item} onSent={refresh} />}
      />
    </Screen>
  );
}

function Thread({ thread, onSent }: { thread: ClarificationThread; onSent: () => void }) {
  const [messages, setMessages] = React.useState<ClarificationMessage[]>([]);
  const [reply, setReply] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    /*
     * The route hands back { issueCode, status, messages }, not a bare array —
     * see src/app/api/citizen/clarifications/[threadId]/messages/route.ts.
     * Typing this call as ClarificationMessage[] and setting state straight
     * from it skipped that unwrap: `messages` state became the whole wrapper
     * object, which has no .map, and crashed the first time this citizen ever
     * had a thread with a message in it.
     */
    const result = await api<{ messages: ClarificationMessage[] }>(
      `/api/citizen/clarifications/${thread.id}/messages`,
    );
    setMessages(result.messages);
  }, [thread.id]);

  React.useEffect(() => {
    void load().catch(() => setMessages([]));
  }, [load]);

  async function send() {
    setBusy(true);
    try {
      await api(`/api/citizen/clarifications/${thread.id}/messages`, {
        method: "POST",
        body: { body: reply },
      });
      setReply("");
      await load();
      onSent();
    } catch {
      // Keep the text so a failed send loses nothing.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.about}>About your report {thread.issueCode}</Text>

      {messages.map((message) => (
        <View
          key={message.id}
          style={[
            styles.bubble,
            message.senderKind === "citizen" ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          <Text
            style={[styles.who, message.senderKind === "citizen" && { color: colors.white }]}
          >
            {/*
              Staff names are not shown to the public: the case belongs to the
              department, officers move on, and naming a person invites people
              to chase an individual instead of an office.
            */}
            {message.senderKind === "citizen" ? "You" : "The department"}
          </Text>
          <Text
            style={[styles.text, message.senderKind === "citizen" && { color: colors.white }]}
          >
            {message.body}
          </Text>
          <Text
            style={[styles.time, message.senderKind === "citizen" && { color: colors.civic100 }]}
          >
            {formatDateTime(message.createdAt)}
          </Text>
        </View>
      ))}

      <View style={styles.composer}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          multiline
          accessibilityLabel="Your answer"
          placeholder="Type your answer…"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send answer"
          onPress={send}
          disabled={busy || !reply.trim()}
          style={[styles.send, (busy || !reply.trim()) && { opacity: 0.5 }]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  about: { fontSize: 14, fontWeight: "700", color: colors.ink, marginBottom: spacing.md },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: "90%",
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.civic600 },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.canvas },
  who: { fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 2 },
  text: { fontSize: 15, lineHeight: 21, color: colors.ink },
  time: { fontSize: 11, color: colors.muted, marginTop: 3 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: colors.white, fontSize: 15, fontWeight: "600" },
});
