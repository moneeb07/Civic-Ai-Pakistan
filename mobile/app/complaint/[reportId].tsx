import * as React from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { ComplaintDetail, DepartmentMember, DepartmentOption } from "@/api/types";
import { useSession } from "@/context/session";
import { Button, Empty, ErrorNote, Loading, Pill, Screen } from "@/components/ui";
import { colors, formatDateTime, radius, spacing } from "@/theme";

/*
 * One complaint, and the work an officer can actually do to it.
 *
 * Until now an officer on the phone could read a queue and nothing else. This
 * is the screen that closes that: advance the complaint through its
 * department's own workflow, or reopen a resolved one.
 *
 * Every control here is gated by `permissions`, which the SERVER computes from
 * the same authorize.ts predicates the mutating routes enforce. The client
 * never decides what an officer may do — it only renders the answer. So a
 * member sees no Reopen button because reopening is a dept head's call, and an
 * org head sees neither, because department work is not theirs to advance.
 */
export default function ComplaintScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const { data, error, loading, refresh } = useQuery<ComplaintDetail>(
    reportId ? `/api/gov/complaints/${encodeURIComponent(reportId)}` : null,
  );

  const { me } = useSession();
  const [note, setNote] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  /*
   * The two pickers are only fetched when the server has actually granted the
   * matching permission, so a member's phone never requests a staff roster it
   * has no use for and would be refused anyway.
   */
  const canAssign = data?.permissions.canAssign ?? false;
  const canRoute = data?.permissions.canRoute ?? false;
  const orgId = me?.officer.available ? me.officer.orgId : null;

  const members = useQuery<DepartmentMember[]>(canAssign ? "/api/gov/members" : null);
  const departments = useQuery<DepartmentOption[]>(
    canRoute && orgId ? `/api/gov/departments?orgId=${encodeURIComponent(orgId)}` : null,
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
        <Empty
          title="Complaint not found"
          detail="This complaint is outside your department, or does not exist."
        />
      </Screen>
    );
  }

  const { complaint, progress, permissions } = data;
  const assignment = complaint.assignment;

  const missingNote = permissions.requiresNote && !note.trim();
  const missingPhoto = permissions.requiresPhoto && !photoUrl.trim();

  async function advance() {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/gov/complaints/${reportId}/advance`, {
        method: "POST",
        body: { note: note.trim() || undefined, photoUrl: photoUrl.trim() || undefined },
      });
      setNote("");
      setPhotoUrl("");
      refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function assignTo(officerId: string, name: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/gov/complaints/${reportId}/assign`, {
        method: "POST",
        body: { officerId },
      });
      refresh();
      Alert.alert("Assigned", `This complaint is now with ${name}.`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function routeTo(deptId: string, name: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/gov/complaints/${reportId}/route-to-dept`, {
        method: "POST",
        body: { deptId },
      });
      refresh();
      Alert.alert("Routed", `This complaint is now with ${name}.`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  function confirmReopen() {
    /*
     * Reopening undoes a department's own "this is finished" and puts the
     * complaint back on somebody's desk, so it asks first — the same
     * ConfirmDialog gate the web puts on it.
     */
    Alert.alert(
      "Reopen this complaint?",
      "It goes back into the workflow and the citizen sees it as unresolved again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reopen", style: "destructive", onPress: () => void reopen() },
      ],
    );
  }

  async function reopen() {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/gov/complaints/${reportId}/reopen`, { method: "POST" });
      refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <Text style={styles.title}>{complaint.title ?? "Complaint"}</Text>
        {complaint.locationLabel ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={colors.muted} />
            <Text style={styles.meta}>{complaint.locationLabel}</Text>
          </View>
        ) : null}

        <View style={styles.pillRow}>
          {complaint.severity ? <Pill text={complaint.severity} tone="warn" /> : null}
          {assignment?.isResolved ? <Pill text="Resolved" tone="civic" /> : null}
          {complaint.needsAttention ? <Pill text="Needs attention" tone="warn" /> : null}
        </View>

        {complaint.description ? (
          <Text style={styles.description}>{complaint.description}</Text>
        ) : null}

        {/* Assignment summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ASSIGNMENT</Text>
          <Row label="Department" value={assignment?.deptName ?? "Not routed"} />
          <Row label="Officer" value={assignment?.assignedOfficerName ?? "Unassigned"} />
          <Row
            label="Stage"
            value={assignment?.isResolved ? "Resolved" : (assignment?.currentStageName ?? "—")}
          />
        </View>

        {/* The department's own stage history, in its own words. */}
        {progress.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>PROGRESS</Text>
            {progress.map((entry) => (
              <View key={entry.id} style={styles.progressRow}>
                <Ionicons
                  name={entry.completedAt ? "checkmark-circle" : "ellipse-outline"}
                  size={16}
                  color={entry.completedAt ? colors.civic600 : colors.lineStrong}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.progressStage}>{entry.stageName}</Text>
                  <Text style={styles.progressMeta}>
                    {formatDateTime(entry.enteredAt)}
                    {entry.completedByOfficerName ? ` · ${entry.completedByOfficerName}` : ""}
                  </Text>
                  {entry.note ? <Text style={styles.progressNote}>{entry.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {complaint.rating ? (
          <View style={[styles.card, complaint.needsAttention && styles.cardFlagged]}>
            <Text style={styles.cardTitle}>CITIZEN RATING</Text>
            <Text style={styles.rating}>{"★".repeat(complaint.rating.stars)}{"☆".repeat(5 - complaint.rating.stars)}</Text>
            {complaint.rating.comment ? (
              <Text style={styles.ratingComment}>{complaint.rating.comment}</Text>
            ) : null}
            {complaint.needsAttention ? (
              <Text style={styles.flagged}>Flagged — a low rating needs a second look.</Text>
            ) : null}
          </View>
        ) : null}

        {actionError ? <ErrorNote message={actionError} /> : null}

        {/* -- Actions, entirely server-gated ------------------------------- */}

        {/*
          Routing: an org head sending unrouted work to a department. The
          amber warning mirrors the web's — assigning into a department with
          no workflow defined would put the complaint into a process that does
          not exist, so it is blocked rather than silently accepted.
        */}
        {permissions.canRoute ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ROUTE TO A DEPARTMENT</Text>
            {(departments.data ?? []).map((dept) => (
              <Pressable
                key={dept.id}
                accessibilityRole="button"
                disabled={busy || dept.hasWorkflow === false}
                onPress={() => void routeTo(dept.id, dept.name)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && { opacity: 0.7 },
                  dept.hasWorkflow === false && { opacity: 0.5 },
                ]}
              >
                <Ionicons name="git-branch-outline" size={16} color={colors.civic700} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName}>{dept.name}</Text>
                  {dept.hasWorkflow === false ? (
                    <Text style={styles.pickerWarn}>No workflow defined yet</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.muted} />
              </Pressable>
            ))}
            {departments.loading ? <Text style={styles.pickerHint}>Loading…</Text> : null}
          </View>
        ) : null}

        {/*
          Assignment: a dept head putting routed work on a member's desk.
          
          Shown ONLY while the complaint is unassigned, which is exactly what
          the web's dept queue does. That is not a cosmetic match: assignment
          always (re)starts the workflow at stage 0 and writes a fresh progress
          row — see assignComplaint() — so offering it on a complaint already
          mid-workflow would silently throw away the department's progress. If
          reassignment is ever wanted it needs a server change that preserves
          the stage, not just a button here.
        */}
        {permissions.canAssign && !assignment?.assignedOfficerId ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ASSIGN TO A MEMBER</Text>
            {(members.data ?? [])
              // The dept head assigns work out; they are not in their own picker.
              .filter((member) => member.role === "member")
              .map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void assignTo(member.id, member.name)}
                  style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="person-outline" size={16} color={colors.civic700} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>{member.name}</Text>
                    <Text style={styles.pickerHint}>{member.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.muted} />
                </Pressable>
              ))}
            {members.loading ? <Text style={styles.pickerHint}>Loading…</Text> : null}
          </View>
        ) : null}
        {assignment?.isResolved ? (
          <View style={styles.card}>
            <View style={styles.resolvedNotice}>
              <Ionicons name="checkmark-circle" size={18} color={colors.civic600} />
              <Text style={styles.resolvedText}>
                This complaint reached its department&rsquo;s final stage.
              </Text>
            </View>
            {permissions.canReopen ? (
              <Button label="Reopen" variant="quiet" busy={busy} onPress={confirmReopen} />
            ) : null}
          </View>
        ) : permissions.canAdvance ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>MOVE THIS FORWARD</Text>

            {permissions.requiresPhoto ? (
              <>
                <Text style={styles.fieldLabel}>Photo URL (required at this stage)</Text>
                <TextInput
                  value={photoUrl}
                  onChangeText={setPhotoUrl}
                  autoCapitalize="none"
                  placeholder="https://…"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>
              Note{permissions.requiresNote ? " (required at this stage)" : " (optional)"}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="What was done?"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            />

            <Button
              label="Advance stage"
              busy={busy}
              disabled={missingNote || missingPhoto}
              onPress={advance}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, letterSpacing: -0.4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  description: { marginTop: spacing.md, fontSize: 14, lineHeight: 21, color: colors.ink },

  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardFlagged: { borderColor: "#f3c9c7", backgroundColor: colors.dangerBg },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 5 },
  rowLabel: { width: 110, fontSize: 13, color: colors.muted },
  rowValue: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.ink },

  progressRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm },
  progressStage: { fontSize: 14, fontWeight: "600", color: colors.ink },
  progressMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },
  progressNote: { fontSize: 13, color: colors.ink, marginTop: 4 },

  rating: { fontSize: 18, color: colors.amber700 },
  ratingComment: { marginTop: spacing.sm, fontSize: 13, color: colors.ink },
  flagged: { marginTop: spacing.sm, fontSize: 12, fontWeight: "600", color: colors.danger },

  resolvedNotice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  resolvedText: { flex: 1, fontSize: 14, color: colors.ink },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pickerName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  pickerHint: { fontSize: 11, color: colors.muted, marginTop: 1 },
  pickerWarn: { fontSize: 11, color: colors.amber700, marginTop: 1 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.ink, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    marginBottom: spacing.md,
  },
});
