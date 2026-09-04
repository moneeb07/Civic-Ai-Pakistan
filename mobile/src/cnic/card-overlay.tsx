import * as React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";

import { ROI } from "./roi";
import { colors } from "@/theme";

/*
 * The dark scrim with a transparent CNIC-shaped window, corner guides and a
 * status pill. Ported from the reference project; the geometry is unchanged,
 * the palette is CivicAI's so the camera does not look like a different app.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const BOX = {
  left: SCREEN_W * ROI.x,
  top: SCREEN_H * ROI.y,
  width: SCREEN_W * ROI.w,
  height: SCREEN_H * ROI.h,
};

function Corner({ style, color }: { style: object; color: string }) {
  return <View style={[styles.corner, { borderColor: color }, style]} />;
}

export function CardOverlay({
  aligned,
  hint,
  countdown = 0,
  title,
}: {
  aligned: boolean;
  hint: string;
  countdown?: number;
  title: string;
}) {
  const color = aligned ? colors.civic500 : "#E5E7EB";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Scrim: four rectangles around the cut-out box */}
      <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: BOX.top }]} />
      <View
        style={[styles.scrim, { top: BOX.top, left: 0, width: BOX.left, height: BOX.height }]}
      />
      <View
        style={[
          styles.scrim,
          { top: BOX.top, left: BOX.left + BOX.width, right: 0, height: BOX.height },
        ]}
      />
      <View
        style={[styles.scrim, { top: BOX.top + BOX.height, left: 0, right: 0, bottom: 0 }]}
      />

      {/* The card window frame */}
      <View
        style={[
          styles.box,
          {
            left: BOX.left,
            top: BOX.top,
            width: BOX.width,
            height: BOX.height,
            borderColor: aligned ? colors.civic500 : "rgba(255,255,255,0.35)",
          },
        ]}
      >
        <Corner style={styles.tl} color={color} />
        <Corner style={styles.tr} color={color} />
        <Corner style={styles.bl} color={color} />
        <Corner style={styles.br} color={color} />

        {aligned && countdown > 0 ? (
          <View style={styles.countdownWrap} pointerEvents="none">
            <Text style={styles.countdown}>{countdown}</Text>
          </View>
        ) : null}
      </View>

      {/* Which side is being asked for, above the box */}
      <Text style={[styles.title, { top: BOX.top - 44 }]}>{title}</Text>

      {/* Status pill below the box */}
      <View style={[styles.pill, { top: BOX.top + BOX.height + 24 }]}>
        <View
          style={[styles.dot, { backgroundColor: aligned ? colors.civic500 : "#F59E0B" }]}
        />
        {/* The camera screen owns the wording for every stage (checking,
            holding still, counting down), so just show whatever it decided. */}
        <Text style={styles.pillText}>{hint || "Align the card…"}</Text>
      </View>
    </View>
  );
}

const CORNER = 28;
const THICK = 4;

const styles = StyleSheet.create({
  scrim: { position: "absolute", backgroundColor: "rgba(7,12,22,0.72)" },
  box: { position: "absolute", borderWidth: 2, borderRadius: 16 },
  corner: { position: "absolute", width: CORNER, height: CORNER },
  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  countdown: {
    fontSize: 72,
    fontWeight: "800",
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  tl: { top: -2, left: -2, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: 16 },
  tr: {
    top: -2,
    right: -2,
    borderTopWidth: THICK,
    borderRightWidth: THICK,
    borderTopRightRadius: 16,
  },
  bl: {
    bottom: -2,
    left: -2,
    borderBottomWidth: THICK,
    borderLeftWidth: THICK,
    borderBottomLeftRadius: 16,
  },
  br: {
    bottom: -2,
    right: -2,
    borderBottomWidth: THICK,
    borderRightWidth: THICK,
    borderBottomRightRadius: 16,
  },
  title: {
    position: "absolute",
    width: "100%",
    textAlign: "center",
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "600",
  },
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17,24,39,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    left: SCREEN_W * 0.5 - 130,
    width: 260,
    justifyContent: "center",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  pillText: { color: "#F3F4F6", fontSize: 14, fontWeight: "500" },
});
