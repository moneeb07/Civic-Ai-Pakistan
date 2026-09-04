import * as React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { ClarificationMessage, IssueDetail } from "@/api/types";
import {
  Body,
  Button,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Pill,
  Screen,
} from "@/components/ui";
import { colors, formatDate, radius, spacing } from "@/theme";

/*
 * The issue workspace on a phone.
 *
 * Same three things as the web page — what the AI grouped, what the department
 * is saying, what it has asked the reporters — because an officer standing at
 * the actual pothole is exactly the person who most needs all three.
 */
export default function IssueScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { data, error, loading, refresh } = useQuery<IssueDetail>(
    code ? `/api/gov/issues/${encodeURIComponent(code)}` : null,
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
        <Empty title="Issue not found" detail="It may belong to another department." />
      </Screen>
    );
  }

  const { issue, reports, conversations, clarifications } = data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <View style={styles.row}>
          <Text style={styles.code}>{issue.issueCode}</Text>
          {issue.reportCount > 1 ? (
            <Pill tone="civic" text={`${issue.reportCount} reports`} />
          ) : null}
        </View>

        <Text style={styles.title}>{issue.title}</Text>
        {issue.locationLabel ? <Text style={styles.meta}>{issue.locationLabel}</Text> : null}
        <Text style={styles.meta}>
          {issue.deptName ?? "Not routed yet"} · {formatDate(issue.createdAt)}
        </Text>

        {issue.description ? <Text style={styles.description}>{issue.description}</Text> : null}

        {/*
          The routing rationale is shown rather than hidden. An officer who can
          see why a department was suggested can disagree with it; one who is
          only told the answer can only comply.
        */}
        {issue.routingRationale ? (
          <View style={styles.rationale}>
            <Text style={styles.rationaleTitle}>
              Why this department was suggested
              {issue.routingConfidence !== null
                ? ` · ${Math.round(issue.routingConfidence * 100)}%`
                : ""}
            </Text>
            <Text style={styles.rationaleBody}>{issue.routingRationale}</Text>
          </View>
        ) : null}

        <Text style={styles.heading}>Reports in this issue ({reports.length})</Text>
        <View style={styles.group}>
          {/*
            Each report opens the complaint screen, which is where the actual
            work happens — advancing the department's workflow, or reopening a
            resolved case. What that screen offers is decided by the server
            from this officer's role, so tapping through never promises an
            action they cannot take.
          */}
          {reports.map((report) => (
            <Pressable
              key={report.linkId}
              accessibilityRole="button"
              onPress={() => router.push(`/complaint/${report.reportId}`)}
              style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.reportHead}>
                <Text style={styles.reportTitle}>{report.title ?? "Untitled report"}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </View>
              {report.matchStatus === "needs_review" ? (
                <Pill tone="warn" text="Unconfirmed match" />
              ) : null}
              {report.locationLabel ? (
                <Text style={styles.meta}>{report.locationLabel}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.heading}>Discussion</Text>
        {conversations.length === 0 ? (
          <Body muted>No discussion yet.</Body>
        ) : (
          <View style={styles.group}>
            {conversations.map((conversation) => (
              <Pressable
                key={conversation.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/conversation/${conversation.id}?issue=${issue.issueCode}`)
                }
                style={styles.threadRow}
              >
                <Text style={styles.threadTitle}>
                  {conversation.visibility === "private" ? "🔒 " : ""}
                  {conversation.title}
                </Text>
                <Text style={styles.meta}>
                  {conversation.messageCount}{" "}
                  {conversation.messageCount === 1 ? "message" : "messages"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.heading}>Questions to reporters</Text>
        {clarifications.length === 0 ? (
          <Body muted>No questions asked yet.</Body>
        ) : (
          <View style={styles.group}>
            {clarifications.map((thread) => (
              <ClarificationRow
                key={thread.id}
                threadId={thread.id}
                citizenName={thread.citizenName}
                unread={thread.unreadForOfficer}
                onSent={refresh}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * One officer↔citizen exchange, expandable in place.
 *
 * Kept visually apart from the discussion list above, and every composer here
 * says who will read it: the mistake that would actually matter is an officer
 * typing an internal remark into a box a member of the public can see.
 */
function ClarificationRow({
  threadId,
  citizenName,
  unread,
  onSent,
}: {
  threadId: string;
  citizenName: string | null;
  unread: number;
  onSent: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ClarificationMessage[] | null>(null);
  const [reply, setReply] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const next = await api<ClarificationMessage[]>(`/api/gov/clarifications/${threadId}/messages`);
    setMessages(next);
  }, [threadId]);

  React.useEffect(() => {
    if (open && messages === null) void load().catch(() => setMessages([]));
  }, [open, messages, load]);

  async function send() {
    setBusy(true);
    try {
      await api(`/api/gov/clarifications/${threadId}/messages`, {
        method: "POST",
        body: { body: reply },
      });
      setReply("");
      await load();
      onSent();
    } catch {
      // The composer keeps the text so nothing typed is lost on a failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.threadRow}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((o) => !o)}>
        <Text style={styles.threadTitle}>
          {citizenName ?? "Reporter"}
          {unread > 0 ? `  ·  ${unread} new` : ""}
        </Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: spacing.md }}>
          {(messages ?? []).map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.senderKind === "officer" ? styles.bubbleOfficer : styles.bubbleCitizen,
              ]}
            >
              <Text
                style={[
                  styles.bubbleWho,
                  message.senderKind === "officer" && { color: colors.white },
                ]}
              >
                {message.senderKind === "officer" ? "Your department" : (citizenName ?? "Reporter")}
              </Text>
              <Text
                style={[
                  styles.bubbleText,
                  message.senderKind === "officer" && { color: colors.white },
                ]}
              >
                {message.body}
              </Text>
            </View>
          ))}

          <Field
            label="Reply to the reporter"
            value={reply}
            onChangeText={setReply}
            multiline
            placeholder="Type your reply…"
          />
          <Text style={styles.warning}>The reporter will see this message.</Text>
          <Button label="Send" onPress={send} busy={busy} disabled={!reply.trim()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.civic700 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: spacing.sm },
  meta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  description: { fontSize: 15, lineHeight: 22, color: colors.ink, marginTop: spacing.lg },
  rationale: {
    backgroundColor: colors.civic50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  rationaleTitle: { fontSize: 13, fontWeight: "700", color: colors.civic700 },
  rationaleBody: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 3 },
  heading: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: spacing.xl },
  group: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  reportRow: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  reportHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reportTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  threadRow: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  threadTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  bubble: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, maxWidth: "90%" },
  bubbleOfficer: { alignSelf: "flex-end", backgroundColor: colors.civic600 },
  bubbleCitizen: { alignSelf: "flex-start", backgroundColor: colors.canvas },
  bubbleWho: { fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 2 },
  bubbleText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  warning: { fontSize: 12, color: colors.amber700, marginBottom: spacing.sm },
});
