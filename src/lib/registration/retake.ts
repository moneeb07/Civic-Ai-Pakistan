/*
 * Which side of the CNIC to send a citizen back to after a failed read.
 *
 * Pure and framework-free so the rule can be tested directly: the UI that uses
 * it is a camera component, and "does a bad address send them to the BACK
 * camera, keeping the front?" is a question worth answering without a browser.
 *
 * The rule exists because the alternative — restarting the whole identity step
 * on any failure — makes a citizen re-photograph a side that read perfectly.
 * `affectedSide` comes straight from the accuracy gate (lib/cnic-confidence.ts),
 * which in turn is told by the model, per side, whether that specific image
 * was clear enough to read — so this is no longer a guess based on which FIELD
 * failed, it is the actual side the read points at.
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
   * caller holds the blobs and the bug this module exists to prevent was
   * precisely a caller that dropped one side and silently re-submitted the
   * other. A plan that says what to discard cannot be half-applied.
   */
  discards: CnicSide[];
}

/**
 * Decides the plan from the gate's own verdict and which photos are on file.
 *
 * "front" or "back" points precisely at the side that needs a retake — the
 * spec's Scenario A/B: a bad back never sends the citizen back to the front,
 * and vice versa.
 *
 * "both" means the model explicitly reported BOTH images unreadable. Neither
 * photo is worth keeping, so both are discarded and the citizen walks the
 * front-then-back flow again from the start. This case used to be merged with
 * "unknown" below, and that merge was a real defect: the bad back was kept, so
 * a second attempt only ever re-photographed the front, re-sent the same
 * unreadable back, and failed identically — for ever. The address lives on the
 * back, so the visible symptom was an address that could never be read no
 * matter how many times the citizen tried.
 *
 * "unknown" is the honest fallback when the read genuinely does not
 * distinguish the two (or an older response shape omitted the signal). It
 * starts with the front, matching the natural order of the flow, and never
 * discards a back that was never implicated.
 *
 * A side can only be KEPT if its photo actually exists; a plan that re-uses a
 * blob that was never captured would silently drop the citizen back to a
 * front-only read without saying so.
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

// -- Manual-fallback offer ----------------------------------------------------

/**
 * Whether repeated scan failures have earned a prominent "enter manually"
 * offer, rather than leaving a citizen to notice the quiet link on their own.
 *
 * Pure so the threshold and the re-arm-on-new-failure behaviour are provable
 * without a browser or a React renderer. The identity flow calls this with
 * its own local failure count — deliberately its own counter, separate from
 * AssistedModeProvider's app-wide struggle count, which drives a different
 * offer (voice guidance) and would otherwise conflate two different kinds of
 * difficulty.
 */
export const MANUAL_FALLBACK_THRESHOLD = 2;

export function shouldOfferManualFallback(
  consecutiveFailures: number,
  dismissed: boolean,
): boolean {
  return consecutiveFailures >= MANUAL_FALLBACK_THRESHOLD && !dismissed;
}
