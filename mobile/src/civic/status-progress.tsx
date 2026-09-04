import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  CIVIC_STATUSES,
  deriveStatus,
  statusIndex,
  statusPresentation,
  type CivicStatus,
} from "./status";
import { colors, radius, spacing } from "@/theme";

/*
 * The product's signature control, ported from the web's StatusProgress.
 *
 *   ●───●───○   Reported · {the department's own stage name} · Resolved
 *
 * The middle label deliberately borrows the department's REAL stage name
 * ("Valve isolated", "Inspection scheduled") rather than flattening every
 * department's process into a generic "In process" — telling a citizen the
 * actual stage is more honest, and it is the one place the department's own
 * vocabulary reaches them.
 *
 * The current bead carries a ring as well as a fill, so its position reads
 * without relying on colour alone.
 */
export function StatusProgress({
  stageName,
  isResolved,
  compact = false,
}: {
  stageName: string | null | undefined;
  isResolved: boolean;
  compact?: boolean;
}) {
  const status = deriveStatus({ stageName, isResolved });
  const activeIndex = statusIndex(status);

  const labels: string[] = [
    "Reported",
    // The middle step is the only one a department gets to name.
    stageName && !isResolved ? stageName : "In process",
    "Resolved",
  ];

  const beadSize = compact ? 10 : 14;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Status: ${statusPresentation(status).label}`}
      style={styles.root}
    >
      <View style={styles.track}>
        {CIVIC_STATUSES.map((step, index) => {
          const done = index <= activeIndex;
          const current = index === activeIndex;
          const tint = statusPresentation(step).color;

          return (
            <React.Fragment key={step}>
              {index > 0 ? (
                <View
                  style={[
                    styles.rail,
                    index <= activeIndex && { backgroundColor: statusPresentation(status).color },
                  ]}
                />
              ) : null}

              <View
                style={[
                  styles.bead,
                  {
                    width: beadSize,
                    height: beadSize,
                    borderRadius: beadSize / 2,
                    backgroundColor: done ? tint : colors.surface,
                    borderColor: done ? tint : colors.lineStrong,
                  },
                  current && !compact && { borderWidth: 4, borderColor: `${tint}44` },
                ]}
              />
            </React.Fragment>
          );
        })}
      </View>

      {compact ? null : (
        <View style={styles.labels}>
          {labels.map((label, index) => (
            <Text
              key={label + index}
              numberOfLines={1}
              style={[
                styles.label,
                index === activeIndex && { color: statusPresentation(status).color, fontWeight: "700" },
                index === 0 && { textAlign: "left" },
                index === 2 && { textAlign: "right" },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** The pill form — icon plus label, never colour alone. */
export function StatusBadge({ status }: { status: CivicStatus }) {
  const presentation = statusPresentation(status);
  return (
    <View style={[styles.badge, { backgroundColor: presentation.bg, borderColor: presentation.line }]}>
      <View style={[styles.badgeDot, { backgroundColor: presentation.color }]} />
      <Text style={[styles.badgeText, { color: presentation.color }]}>{presentation.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%" },
  track: { flexDirection: "row", alignItems: "center" },
  bead: { borderWidth: 2 },
  rail: { flex: 1, height: 2, backgroundColor: colors.lineStrong, marginHorizontal: 4 },
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  label: { flex: 1, fontSize: 11, color: colors.muted, textAlign: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
