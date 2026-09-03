/*
 * Did the citizen actually photograph the side we asked for?
 *
 * This check exists because of a failure that is invisible without it. A
 * citizen photographs the front, is asked for the back, and photographs the
 * front again — easily done, the card is in their hand and both sides look
 * like "the card". The read that comes back is then perfectly confident and
 * completely correct: name, CNIC number, dates, all clean. It simply has no
 * address in it, because no image of the address was ever sent.
 *
 * Every downstream check passes. The accuracy gate is satisfied. The citizen
 * is shown a successful scan with an empty address and no explanation, and no
 * amount of retrying fixes it, because nothing in the system has noticed that
 * the second photo was the wrong side. Naming that out loud — "that's the
 * front again, please turn the card over" — is the entire fix.
 *
 * Pure and framework-free so every combination is testable without a camera:
 * the whole point is the cases nobody thinks to try by hand.
 */

/** What the model observed in one image. Null = it expressed no usable opinion. */
export type ObservedSide = "front" | "back" | "unknown" | null;

export type SideFailure =
  /** The image submitted as the front is actually the back of the card. */
  | "front_is_back"
  /** The image submitted as the back is actually the front of the card. */
  | "back_is_front"
  /** Two photographs of the same side. */
  | "same_side_twice"
  /** Both sides were photographed, but into each other's slots. */
  | "sides_swapped";

export interface SideCheckResult {
  ok: boolean;
  failure: SideFailure | null;
  /** Which side to send the citizen back to. Null when nothing is wrong. */
  retake: "front" | "back" | null;
  /**
   * Whether BOTH photos have to be taken again.
   *
   * Only true for a swap. Every other failure leaves one good photo on file
   * that must not be thrown away — asking someone to re-photograph a side that
   * was fine is exactly the loop this whole area exists to prevent.
   */
  retakeBoth: boolean;
}

const OK: SideCheckResult = { ok: true, failure: null, retake: null, retakeBoth: false };

/**
 * Compares what each image was submitted AS against what it was observed to BE.
 *
 * Two rules govern everything here:
 *
 * 1. Only a positive, confident observation can raise a complaint. "unknown"
 *    and null both mean the model has no usable opinion, and accusing a
 *    citizen of photographing the wrong side on the strength of a shrug would
 *    be worse than the silence it replaces — they would be sent back to
 *    re-photograph a card that was fine.
 *
 * 2. A front-only submission can never fail for a back-side reason. There is
 *    no second image to be wrong about, and the back is optional by design.
 */
export function checkSubmittedSides(observed: {
  front: ObservedSide;
  back: ObservedSide;
  /** Whether a back image was submitted at all. */
  backSubmitted: boolean;
}): SideCheckResult {
  const front = observed.front;
  const back = observed.backSubmitted ? observed.back : null;

  /*
   * Both images are the same side, and we are sure of both. Reported ahead of
   * the individual checks because it is the more useful thing to say: "you
   * photographed the same side twice" tells the citizen what actually happened,
   * where "the back is the front" describes only half of it.
   *
   * The retake target is the side that is MISSING, which is the one thing the
   * citizen has to go and do. Two fronts means the back is missing.
   */
  if (front !== null && front !== "unknown" && front === back) {
    return {
      ok: false,
      failure: "same_side_twice",
      retake: front === "front" ? "back" : "front",
      retakeBoth: false,
    };
  }

  /*
   * Both sides were photographed, into each other's slots.
   *
   * Called out separately because the naive answer is wrong in an expensive
   * way: "the front slot holds the back" suggests retaking just the front,
   * which keeps a back-slot photo that is really a front — so the next attempt
   * fails as "the same side twice" and the citizen has burned a round trip
   * being told something different each time. Both photos are in the wrong
   * place, so both are taken again and the citizen is told plainly what
   * happened.
   */
  if (front === "back" && back === "front") {
    return { ok: false, failure: "sides_swapped", retake: "front", retakeBoth: true };
  }

  // The front slot holds the address side. The citizen needs to turn it over.
  if (front === "back") {
    return { ok: false, failure: "front_is_back", retake: "front", retakeBoth: false };
  }

  // The back slot holds the photo side — the classic "photographed the front
  // twice" case, and the one that silently costs the address.
  if (back === "front") {
    return { ok: false, failure: "back_is_front", retake: "back", retakeBoth: false };
  }

  return OK;
}
