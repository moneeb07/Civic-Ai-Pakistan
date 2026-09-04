/*
 * Which side of the CNIC to send a citizen back to after a failed read.
 *
 * Ported from src/lib/registration/retake.ts in the web app, unchanged. The
 * rule has to be identical on both clients: it decides which photograph is
 * kept, and a phone that discarded a good front where the browser kept it
 * would make the same card behave differently depending on the device.
 *
 * The rule exists because the alternative — restarting the whole identity step
 * on any failure — makes a citizen re-photograph a side that read perfectly.
 */

export type CnicSide = "front" | "back";
export type AffectedSide = CnicSide | "both" | "unknown";

export interface RetakePlan {
  /** The side to photograph again, and the camera the citizen is sent to first. */
  retake: CnicSide;
  /** The side whose existing photo is kept and re-used, if any. */
  keeps: CnicSide | null;
  /**
   * Photos that must be thrown away.
   *
   * Stated explicitly rather than left as "whatever isn't kept", because the
   * caller holds the images and the bug this module exists to prevent was
   * precisely a caller that dropped one side and silently re-submitted the
   * other. A plan that says what to discard cannot be half-applied.
   */
  discards: CnicSide[];
}

/**
 * Decides the plan from the gate's own verdict and which photos are on file.
 *
 * "both" means the model explicitly reported BOTH images unreadable — neither
 * is worth keeping. Merging this case with "unknown" was a real defect: the
 * bad back was kept, so a second attempt only re-photographed the front,
 * re-sent the same unreadable back, and failed identically, for ever. The
 * address lives on the back, so the symptom was an address that could never
 * be read no matter how many times the citizen tried.
 */
export function planRetake(
  affectedSide: AffectedSide | null | undefined,
  onFile: { front: boolean; back: boolean },
): RetakePlan {
  const discardsFor = (keeps: CnicSide | null): CnicSide[] =>
    (["front", "back"] as const).filter((side) => side !== keeps && onFile[side]);

  const plan = (retake: CnicSide, keeps: CnicSide | null): RetakePlan => ({
    retake,
    keeps,
    discards: discardsFor(keeps),
  });

  // Both images explicitly bad: keep neither, and re-walk the whole flow.
  if (affectedSide === "both") return plan("front", null);

  if (affectedSide === "back" && onFile.front) return plan("back", "front");

  return plan("front", onFile.back ? "back" : null);
}

/**
 * Whether repeated scan failures have earned a prominent "enter manually"
 * offer, rather than leaving a citizen to notice the quiet link on their own.
 */
export const MANUAL_FALLBACK_THRESHOLD = 2;

export function shouldOfferManualFallback(
  consecutiveFailures: number,
  dismissed: boolean,
): boolean {
  return consecutiveFailures >= MANUAL_FALLBACK_THRESHOLD && !dismissed;
}
