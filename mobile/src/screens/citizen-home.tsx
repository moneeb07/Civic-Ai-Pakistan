import * as React from "react";
import {
  FlatList,
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useQuery } from "@/api/hooks";
import { useSession } from "@/context/session";
import type { ClarificationThread, TrackedReport, TrackingSummary } from "@/api/types";
import { StatusProgress } from "@/civic/status-progress";
import { Empty, ErrorNote, Loading } from "@/components/ui";
import { colors, formatDate, radius, spacing, STAT_TONES } from "@/theme";

const dashboardHeroImage = require("../../assets/images/dashboard-hero.webp");

interface TrackingPayload {
  summary: TrackingSummary;
  reports: TrackedReport[];
}

/*
 * The citizen dashboard, matching the web's /dashboard screen.
 *
 * Same four figures in the same order, the same greeting pinned to Pakistan
 * time, the same "a department has a question" banner above everything, and
 * the same signature status tracker on every report — so a citizen who checks
 * on their laptop and their phone sees one product, not two.
 */
export function CitizenHome() {
  const router = useRouter();
  const { me } = useSession();
  const tracking = useQuery<TrackingPayload>("/api/citizen/tracking");
  const clarifications = useQuery<ClarificationThread[]>("/api/citizen/clarifications");

  const awaiting = (clarifications.data ?? []).filter((thread) => thread.unreadForCitizen > 0);
  const summary = tracking.data?.summary;

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
            The same photograph and technique as the web dashboard's hero
            band — a real image, not a plain header, carrying the citizen's
            own real greeting. `resizeMode="cover"` inside a height set by
            content (padding, not a fixed number) is the same trick used on
            web: the box is sized by what has to fit in it, and the photo
            simply crops to match, rather than the other way round.
          */}
          <ImageBackground source={dashboardHeroImage} resizeMode="cover" style={styles.hero}>
            <View style={styles.heroScrim} />
            <Text style={styles.heroEyebrow}>CLEANER CITIES · BRIGHTER PAKISTAN</Text>
            <Text style={styles.greeting}>
              {greeting()}, {firstName(me?.user.name)} 👋
            </Text>
            <Text style={styles.greetingSub}>How can we help improve your city today?</Text>
          </ImageBackground>

          {/*
            A department waiting on an answer is the only thing here that blocks
            somebody else's work, so it sits above everything rather than being
            left to be discovered.
          */}
          {awaiting.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/messages")}
              style={styles.prompt}
            >
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.civic700} />
              <View style={{ flex: 1 }}>
                <Text style={styles.promptTitle}>
                  {awaiting.length === 1
                    ? "A department has a question for you"
                    : `${awaiting.length} departments have questions for you`}
                </Text>
                <Text style={styles.promptDetail}>Answering helps them fix it faster.</Text>
              </View>
            </Pressable>
          ) : null}

          {/* The four figures from the web dashboard, same order, same tones. */}
          {summary ? (
            <View style={styles.statGrid}>
              <Stat
                tone="neutral"
                label="My reports"
                value={summary.total}
                hint={summary.drafts > 0 ? `${summary.drafts} still a draft` : "All submitted"}
                onPress={() => router.push("/reports")}
              />
              <Stat
                tone="danger"
                label="Reported"
                value={summary.reported}
                hint="Awaiting a department"
                onPress={() => router.push("/reports")}
              />
              <Stat
                tone="warning"
                label="In process"
                value={summary.inProcess}
                hint="Being worked on"
                onPress={() => router.push("/reports")}
              />
              <Stat
                tone="success"
                label="Resolved"
                value={summary.resolved}
                hint="Confirmed fixed"
                onPress={() => router.push("/reports")}
              />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/report/new")}
            style={styles.reportCta}
          >
            <Ionicons name="add-circle" size={22} color={colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reportCtaTitle}>Report a problem</Text>
              <Text style={styles.reportCtaBody}>A photograph is enough — we work out the rest</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>

          <Text style={styles.heading}>Your recent reports</Text>
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
              <Text style={styles.date}>{formatDate(item.submittedAt)}</Text>
            </View>

            {issue && issue.reportCount > 1 ? (
              <View style={styles.groupPill}>
                <Ionicons name="people" size={11} color={colors.civic700} />
                <Text style={styles.groupPillText}>{issue.reportCount} people reported this</Text>
              </View>
            ) : null}

            <Text style={styles.cardTitle}>{issue?.title ?? item.title ?? "Your report"}</Text>
            {item.locationLabel ? <Text style={styles.meta}>{item.locationLabel}</Text> : null}

            <View style={{ marginTop: spacing.md }}>
              <StatusProgress
                stageName={issue?.stageName ?? null}
                isResolved={issue?.isResolved ?? false}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

/** Pinned to Pakistan time, like the web — not the phone's clock. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(full: string | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "there";
}

function Stat({
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof STAT_TONES;
  onPress?: () => void;
}) {
  const palette = STAT_TONES[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stat,
        { backgroundColor: palette.bg },
        pressed && onPress && { opacity: 0.85 },
      ]}
    >
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: palette.fg }]}>
          <Ionicons name={palette.icon} size={15} color={colors.white} />
        </View>
        <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
        {onPress ? (
          <Ionicons name="arrow-forward" size={13} color={colors.muted} style={{ marginLeft: "auto" }} />
        ) : null}
      </View>
      <Text style={[styles.statValue, { color: tone === "neutral" ? colors.ink : palette.fg }]}>
        {value}
      </Text>
      <Text style={styles.statHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },

  /*
   * `marginHorizontal`/`marginTop` of `-spacing.lg` exactly cancel the
   * FlatList's own `contentContainerStyle` padding, so the photo reaches the
   * true edges of the screen instead of sitting inset like every other card
   * in this list — the same full-bleed treatment the web dashboard's hero
   * gets, achieved here by cancelling a padding rather than avoiding one.
   */
  hero: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    overflow: "hidden",
  },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.55)" },
  heroEyebrow: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.civic700,
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  greeting: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.5,
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  greetingSub: {
    marginTop: 3,
    fontSize: 13.5,
    color: colors.ink,
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  prompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.civic50,
    borderWidth: 1,
    borderColor: colors.civic200,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  promptTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  promptDetail: { fontSize: 12, color: colors.muted, marginTop: 1 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  stat: {
    width: "48%",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { fontSize: 9.5, fontWeight: "700", color: colors.muted, letterSpacing: 0.4 },
  statValue: { marginTop: 8, fontSize: 26, fontWeight: "800" },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 1 },

  reportCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.civic600,
  },
  reportCtaTitle: { fontSize: 16, fontWeight: "700", color: colors.white },
  reportCtaBody: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.8)" },

  heading: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.civic700 },
  date: { fontSize: 11, color: colors.muted },
  groupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.civic50,
  },
  groupPillText: { fontSize: 10, fontWeight: "700", color: colors.civic700 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: spacing.sm },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
