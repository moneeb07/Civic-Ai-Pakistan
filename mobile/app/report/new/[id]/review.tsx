import * as React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Constants from "expo-constants";
import { confirmReport, generateComplaint, getSessionCookie, patchReport } from "@/api/client";
import { CATEGORY_LABELS, CIVIC_CATEGORIES, SEVERITIES, type CivicCategory, type ReportDto, type Severity } from "@/report/types";
import { ReportShell, ReportStepHeading } from "@/report/shell";
import { Button, ErrorNote } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/*
 * Step four: check everything before it's confirmed.
 *
 * Mirrors the web's review screen: an AI-generated title/description/severity
 * on first arrival, every field editable, every AI-sourced field badged and
 * silently dropping its badge the moment the citizen changes it. Nothing here
 * is a re-render of raw data — each edit PATCHes the report row directly, the
 * same source of truth every other step reads from.
 */
type Phase = "generating" | "generation-failed" | "review" | "confirming" | "confirmed";

export default function ReportReviewStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = React.useState<Phase>("generating");
  const [report, setReport] = React.useState<ReportDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [imageUri, setImageUri] = React.useState<string | null>(null);

  const [editingField, setEditingField] = React.useState<"title" | "description" | "location" | null>(null);
  const [draft, setDraft] = React.useState("");
  const [photoCookie, setPhotoCookie] = React.useState<string | null>(null);

  const generate = React.useCallback(async () => {
    setPhase("generating");
    setError(null);
    try {
      const updated = await generateComplaint(id);
      setReport(updated);
      setPhase("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't generate the complaint automatically.");
      setPhase("generation-failed");
    }
  }, [id]);

  React.useEffect(() => {
    void generate();
  }, [generate]);

  React.useEffect(() => {
    let cancelled = false;
    getSessionCookie().then((cookie) => {
      if (cancelled) return;
      const base = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.replace(/\/$/, "") ?? "";
      // The photo route is authenticated, so <Image> needs the session cookie
      // as a header rather than a bare URL — React Native's Image supports
      // per-request headers on remote sources, unlike a browser <img> tag.
      setImageUri(`${base}/api/reports/${id}/image`);
      setPhotoCookie(cookie);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save(patch: Partial<ReportDto>) {
    try {
      const updated = await patchReport(id, patch);
      setReport(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change could not be saved.");
    }
  }

  function startEdit(field: "title" | "description" | "location", currentValue: string) {
    setEditingField(field);
    setDraft(currentValue);
  }

  async function saveEdit() {
    if (!editingField) return;
    const field = editingField;
    setEditingField(null);

    if (field === "title") await save({ title: draft.trim() });
    else if (field === "description") await save({ description: draft.trim() });
    else await save({ locationLabel: draft.trim() });
  }

  async function confirm() {
    setPhase("confirming");
    setError(null);
    try {
      await confirmReport(id);
      setPhase("confirmed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setPhase("review");
    }
  }

  if (phase === "generating") {
    return (
      <ReportShell step="review">
        <View style={styles.centre}>
          <ActivityIndicator color={colors.civic600} size="large" />
          <Ionicons name="sparkles" size={20} color={colors.civic600} style={{ marginTop: spacing.lg }} />
          <Text style={styles.centreTitle}>Preparing your report…</Text>
        </View>
      </ReportShell>
    );
  }

  if (phase === "generation-failed") {
    return (
      <ReportShell step="review">
        <ReportStepHeading title="We couldn't generate the complaint automatically" />
        {error ? <ErrorNote message={error} /> : null}
        <View style={{ gap: spacing.md }}>
          <Button label="Try again" onPress={() => void generate()} />
          <Button
            label="Edit manually"
            variant="quiet"
            onPress={async () => {
              const updated = await patchReport(id, {});
              setReport(updated);
              setPhase("review");
            }}
          />
        </View>
      </ReportShell>
    );
  }

  if (phase === "confirmed") {
    return (
      <ReportShell step="review" onBack={() => router.replace("/home")}>
        <View style={styles.centre}>
          <View style={styles.confirmedIcon}>
            <Ionicons name="checkmark" size={32} color={colors.white} />
          </View>
          <Text style={styles.confirmedTitle}>Your report is ready.</Text>
          <View style={{ marginTop: spacing.xl, alignSelf: "stretch" }}>
            <Button label="Home" onPress={() => router.replace("/home")} />
          </View>
        </View>
      </ReportShell>
    );
  }

  if (!report) return null;

  return (
    <ReportShell step="review">
      <ReportStepHeading title="Check and confirm" />
      {error ? <ErrorNote message={error} /> : null}

      <Section title="Evidence">
        {imageUri ? (
          <Image
            source={{ uri: imageUri, headers: photoCookie ? { Cookie: photoCookie } : undefined }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}
      </Section>

      <Section title="Issue">
        <CategoryPicker
          value={report.category}
          aiSourced={report.categorySource === "ai"}
          onChange={(category) => void save({ category })}
        />
      </Section>

      <EditableSection
        title="Title"
        value={report.title ?? ""}
        aiSourced={report.titleSource === "ai"}
        editing={editingField === "title"}
        draft={draft}
        onDraftChange={setDraft}
        onEdit={() => startEdit("title", report.title ?? "")}
        onSave={saveEdit}
        onCancel={() => setEditingField(null)}
      />

      <EditableSection
        title="Description"
        value={report.description ?? ""}
        aiSourced={report.descriptionSource === "ai"}
        editing={editingField === "description"}
        draft={draft}
        onDraftChange={setDraft}
        onEdit={() => startEdit("description", report.description ?? "")}
        onSave={saveEdit}
        onCancel={() => setEditingField(null)}
        multiline
      />

      <Section title="Severity" hint="AI-estimated — you can change this before confirming.">
        <SeverityPicker value={report.severity} onChange={(severity) => void save({ severity })} />
      </Section>

      <EditableSection
        title="Location"
        value={report.locationLabel ?? ""}
        aiSourced={false}
        editing={editingField === "location"}
        draft={draft}
        onDraftChange={setDraft}
        onEdit={() => startEdit("location", report.locationLabel ?? "")}
        onSave={saveEdit}
        onCancel={() => setEditingField(null)}
      />

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Confirm report" busy={phase === "confirming"} onPress={confirm} />
      </View>
    </ReportShell>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={{ marginTop: spacing.sm }}>{children}</View>
    </View>
  );
}

function AiBadge() {
  return (
    <View style={styles.aiBadge}>
      <Ionicons name="sparkles" size={11} color={colors.civic700} />
      <Text style={styles.aiBadgeText}>AI-generated</Text>
    </View>
  );
}

function EditableSection({
  title,
  value,
  aiSourced,
  editing,
  draft,
  onDraftChange,
  onEdit,
  onSave,
  onCancel,
  multiline,
}: {
  title: string;
  value: string;
  aiSourced: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {aiSourced && !editing ? <AiBadge /> : null}
      </View>

      {editing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            multiline={multiline}
            autoFocus
            style={[styles.editInput, multiline && { minHeight: 100, textAlignVertical: "top" }]}
          />
          <View style={styles.editActions}>
            <Pressable onPress={onCancel} style={styles.editCancel}>
              <Text style={styles.editCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.editSave}>
              <Text style={styles.editSaveText}>Save</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable onPress={onEdit} style={styles.viewRow}>
          <Text style={styles.viewValue}>{value || "—"}</Text>
          <Ionicons name="pencil" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

function CategoryPicker({
  value,
  aiSourced,
  onChange,
}: {
  value: CivicCategory | null;
  aiSourced: boolean;
  onChange: (category: CivicCategory) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <View>
      <View style={styles.sectionHeader}>
        {aiSourced ? <AiBadge /> : <View />}
      </View>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.viewRow}>
        <Text style={styles.viewValue}>{value ? CATEGORY_LABELS[value] : "Select a category"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.categoryList}>
          {CIVIC_CATEGORIES.map((category) => (
            <Pressable
              key={category}
              onPress={() => {
                onChange(category);
                setOpen(false);
              }}
              style={styles.categoryOption}
            >
              <Text style={[styles.categoryOptionText, category === value && { color: colors.civic700, fontWeight: "700" }]}>
                {CATEGORY_LABELS[category]}
              </Text>
              {category === value ? <Ionicons name="checkmark" size={16} color={colors.civic700} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SeverityPicker({
  value,
  onChange,
}: {
  value: Severity | null;
  onChange: (severity: Severity) => void;
}) {
  return (
    <View style={styles.severityRow}>
      {SEVERITIES.map((severity) => {
        const active = severity === value;
        return (
          <Pressable
            key={severity}
            onPress={() => onChange(severity)}
            style={[styles.severityChip, active && styles.severityChipActive]}
          >
            <Text style={[styles.severityText, active && styles.severityTextActive]}>
              {severity.charAt(0) + severity.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl * 4 },
  centreTitle: { marginTop: spacing.lg, fontSize: 16, fontWeight: "700", color: colors.ink },
  confirmedIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.civic600,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmedTitle: { marginTop: spacing.lg, fontSize: 20, fontWeight: "800", color: colors.ink },
  photo: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.civic50 },
  section: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  sectionHint: { marginTop: 2, fontSize: 12, color: colors.muted },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
  },
  aiBadgeText: { fontSize: 10, fontWeight: "700", color: colors.civic700 },
  viewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  viewValue: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 22 },
  editInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.civic600,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 15,
    color: colors.ink,
  },
  editActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, justifyContent: "flex-end" },
  editCancel: { paddingVertical: 8, paddingHorizontal: spacing.md },
  editCancelText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  editSave: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.civic600 },
  editSaveText: { fontSize: 13, fontWeight: "700", color: colors.white },
  categoryList: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  categoryOptionText: { fontSize: 14, color: colors.ink },
  severityRow: { flexDirection: "row", gap: spacing.sm },
  severityChip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  severityChipActive: { borderColor: colors.civic600, backgroundColor: colors.civic50 },
  severityText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  severityTextActive: { color: colors.civic700 },
});
