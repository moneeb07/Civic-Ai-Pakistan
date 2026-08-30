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
export type AffectedSide = CnicSide | "both";

export interface RetakePlan {
  /** The side to photograph again. */
  retake: CnicSide;
  /** The side whose existing photo is kept and re-used, if any. */
  keeps: CnicSide | null;
}

/**
 * Decides the plan from the gate's own verdict and which photos are on file.
 *
 * "front" or "back" points precisely at the side that needs a retake — the
 * spec's Scenario A/B: a bad back never sends the citizen back to the front,
 * and vice versa. "both" is the honest fallback when the read genuinely does
 * not distinguish the two (or an older response shape omitted the signal
 * entirely) — it starts with the front, matching the natural order of the
 * flow, but only ever drops the front's photo; an existing back is kept and
 * can still be retaken on its own afterwards from the review screen.
 *
 * A side can only be KEPT if its photo actually exists; a plan that re-uses a
 * blob that was never captured would silently drop the citizen back to a
 * front-only read without saying so.
 */
export function planRetake(
  affectedSide: AffectedSide | null | undefined,
  onFile: { front: boolean; back: boolean },
): RetakePlan {
  if (affectedSide === "back" && onFile.front) {
    return { retake: "back", keeps: "front" };
  }

  return { retake: "front", keeps: onFile.back ? "back" : null };
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
