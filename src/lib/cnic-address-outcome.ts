/*
 * What to tell a citizen about their address after a scan that PASSED.
 *
 * The gap this closes: the accuracy gate only fails a read when the model
 * found address text and could not read it cleanly. A back photo that yields
 * no address text at all — because the card was held at an angle that cut the
 * address off, because the photo was of the wrong side, because the print is
 * worn, or because the laptop webcam simply resolved too little detail — is
 * not a gate failure. The scan passes, the identity fields are all correct,
 * and the address is quietly absent.
 *
 * Left there, that is the worst kind of bug: everything reports success and
 * the citizen is given no reason, no retry and no alternative. They are simply
 * missing an address and cannot tell whether that is expected.
 *
 * So a passing scan still has to answer, out loud, one of four things:
 *
 *   available     we read it — here it is, check it
 *   not_printed   you didn't photograph the back; scan it or type the address
 *   unreadable    we photographed the back and got nothing; retake or type it
 *   partial       we read some of it, but not all — fill in the rest
 *
 * Pure and framework-free, so every branch is provable without a camera, a
 * network call or a browser.
 */

export type AddressOutcome = "available" | "partial" | "unreadable" | "not_printed";

/** The fields that make an address block actually usable to deliver a report to. */
export interface AddressBlockShape {
  raw: string | null;
  houseNumber: string | null;
  streetOrMohalla: string | null;
  sector: string | null;
  district: string | null;
  city: string | null;
}

export interface AddressOutcomeResult {
  outcome: AddressOutcome;
  /**
   * Whether the citizen must be offered a way to supply the address by hand.
   *
   * True for everything except a clean read. This is the flag the UI is
   * required to act on, and the reason it is computed here rather than being
   * re-derived from three booleans at the call site.
   */
  needsManualEntry: boolean;
}

/** Whether a block carries any usable content at all. */
export function hasAddressContent(block: AddressBlockShape | null | undefined): boolean {
  if (!block) return false;
  return [
    block.raw,
    block.houseNumber,
    block.streetOrMohalla,
    block.sector,
    block.district,
    block.city,
  ].some((field) => typeof field === "string" && field.trim().length > 0);
}

/**
 * Whether a block is complete enough to actually route a civic report to.
 *
 * A raw line alone counts: the card prints the address as one free-text line,
 * so a faithful transcription of that line is the real address even when the
 * model's own attempt to split it into parts came out empty. Requiring the
 * split to succeed would reject a perfectly good read for failing at a task
 * that is a convenience, not the point.
 *
 * What does NOT count is a block holding only a fragment — a house number and
 * nothing else locates nobody.
 */
export function isAddressUsable(block: AddressBlockShape | null | undefined): boolean {
  if (!block) return false;

  const has = (value: string | null) =>
    typeof value === "string" && value.trim().length > 0;

  if (has(block.raw)) return true;

  // No raw line: the split has to carry a locality on its own to be worth anything.
  const locality = has(block.city) || has(block.district) || has(block.sector);
  const street = has(block.streetOrMohalla);

  return locality && street;
}

/**
 * Decides the address outcome for a scan that already passed the accuracy gate.
 *
 * `backScanned` is what separates "you never showed us the back" from "we
 * looked and could not read it" — two situations that need completely
 * different words, and which an earlier version of this flow collapsed into
 * one silent blank.
 */
export function evaluateAddressOutcome(input: {
  backScanned: boolean;
  presentAddress: AddressBlockShape | null;
  permanentAddress: AddressBlockShape | null;
}): AddressOutcomeResult {
  if (!input.backScanned) {
    return { outcome: "not_printed", needsManualEntry: true };
  }

  const blocks = [input.presentAddress, input.permanentAddress];
  const anyContent = blocks.some((block) => hasAddressContent(block));
  const anyUsable = blocks.some((block) => isAddressUsable(block));

  // The back was photographed and produced nothing worth showing.
  if (!anyContent) return { outcome: "unreadable", needsManualEntry: true };

  /*
   * Something came back, but only fragments — a district with no street, a
   * house number on its own. Shown to the citizen so their own reading of the
   * card is not thrown away, but they still have to complete it, so this is
   * emphatically not a success.
   */
  if (!anyUsable) return { outcome: "partial", needsManualEntry: true };

  return { outcome: "available", needsManualEntry: false };
}
