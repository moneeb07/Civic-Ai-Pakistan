import * as React from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { ConversationMessage, IssueDetail } from "@/api/types";
import { ErrorNote, Loading, Screen } from "@/components/ui";
import { colors, formatDateTime, radius, spacing } from "@/theme";
import { useOfficer } from "@/context/session";

/*
 * A department thread — the screen a mention notification lands on.
 *
 * Flat by design: any member of the department can post here and pull in any
 * colleague, with no rank gate anywhere in this file. That is the point of the
 * whole feature. Coordinating on a civic issue should not mean a chain of
 * separate emails and WhatsApp messages that nobody can later reconstruct.
 */
export default function ConversationScreen() {
  const { id, issue } = useLocalSearchParams<{ id: string; issue?: string }>();
  const officer = useOfficer();

  const messages = useQuery<ConversationMessage[]>(
    id ? `/api/gov/conversations/${id}/messages` : null,
  );
  // The roster comes from the issue, so the mention list can only ever contain
  // people this officer is actually allowed to mention.
  const detail = useQuery<IssueDetail>(
    issue ? `/api/gov/issues/${encodeURIComponent(issue)}` : null,
  );

  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const roster = React.useMemo(() => {
    const names = new Map<string, string>();
    for (const message of messages.data ?? []) names.set(message.officerId, message.officerName);
    return [...names.entries()].map(([officerId, name]) => ({ officerId, name }));
  }, [messages.data]);

  // The @query being typed right now, if the caret sits inside one.
  const query = React.useMemo(() => {
    const match = /@([\p{L}\p{N}.'-]*)$/u.exec(body);
    return match ? match[1].toLowerCase() : null;
  }, [body]);

  const suggestions =
    query === null
      ? []
      : roster
          .filter((person) => person.name.toLowerCase().includes(query))
          .filter((person) => person.officerId !== officer?.officerId)
          .slice(0, 5);

  async function send() {
    if (!body.trim() || !id) return;
    setBusy(true);
    try {
      await api(`/api/gov/conversations/${id}/messages`, { method: "POST", body: { body } });
      setBody("");
      messages.refresh();
    } catch {
      // Leave the text in the box: a failed send must not lose what was typed.
    } finally {
      setBusy(false);
    }
  }

  if (messages.loading && !messages.data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={messages.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={messages.error ? <ErrorNote message={messages.error} /> : null}
          renderItem={({ item }) => {
            const isSelf = item.officerId === officer?.officerId;
            return (
              <View style={styles.message}>
                <Text style={styles.author}>
                  {item.officerName}
                  {isSelf ? " (you)" : ""}
                  <Text style={styles.time}>  {formatDateTime(item.createdAt)}</Text>
                </Text>
                <Text style={styles.text}>{item.body}</Text>
                {/*
                  Only mentions the SERVER resolved are acknowledged. A name that
                  matched nobody stays plain text, so the UI never implies
                  somebody was notified when they were not.
                */}
                {item.mentions.length > 0 ? (
                  <Text style={styles.mentions}>
                    Notified: {item.mentions.map((mention) => mention.name).join(", ")}
                  </Text>
                ) : null}
              </View>
            );
          }}
        />

        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((person) => (
              <Pressable
                key={person.officerId}
                accessibilityRole="button"
                onPress={() => setBody((c) => c.replace(/@([\p{L}\p{N}.'-]*)$/u, `@${person.name} `))}
                style={styles.suggestion}
              >
                <Text style={styles.suggestionText}>{person.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            accessibilityLabel="Message"
            placeholder="Write a message. Type @ to mention a colleague."
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            disabled={busy || !body.trim()}
            style={[styles.send, (busy || !body.trim()) && { opacity: 0.5 }]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.lg },
  message: { gap: 2 },
  author: { fontSize: 13, fontWeight: "700", color: colors.ink },
  time: { fontSize: 11, fontWeight: "400", color: colors.muted },
  text: { fontSize: 15, lineHeight: 21, color: colors.ink },
  mentions: { fontSize: 12, color: colors.civic700, marginTop: 2 },
  suggestions: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  suggestion: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  suggestionText: { fontSize: 14, color: colors.ink },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
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
