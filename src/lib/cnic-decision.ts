/*
 * The whole server-side decision for one CNIC scan, in one pure function.
 *
 *   observed sides -> accuracy gate -> address outcome -> what the citizen sees
 *
 * This used to live inline in the API route, spread across three checks with
 * the ORDER between them mattering enormously and stated nowhere. The order is
 * the part that is easy to get wrong and impossible to test through a route
 * that needs a Gemini key and a live session, so it lives here instead, where
 * every combination can be driven directly.
 *
 * The ordering rule, since it is load-bearing:
 *
 *   1. Which side is in the photo, FIRST. Photographing the front twice yields
 *      a read that is confident, correct and simply has no address in it — it
 *      passes every confidence check there is. Run second, this check would
 *      never fire on the one case it exists for.
 *   2. Then the accuracy gate, which decides whether the values are safe to
 *      show at all.
 *   3. Then the address outcome, which only applies to a read that passed and
 *      exists so a missing address is never silent.
 */

import {
  evaluateExtractionConfidence,
  type AffectedSide,
  type GateFailure,
} from "./cnic-confidence";
import { checkSubmittedSides, type ObservedSide, type SideFailure } from "./cnic-side-check";
import {
  evaluateAddressOutcome,
  hasAddressContent,
  type AddressBlockShape,
  type AddressOutcome,
} from "./cnic-address-outcome";

export interface DecisionAddressBlock extends AddressBlockShape {
  confidence: number;
}

export interface DecisionInput {
  readable: boolean;
  frontReadable: boolean | null;
  backReadable: boolean | null;
  frontImageSide: ObservedSide;
  backImageSide: ObservedSide;
  confidence: number;
  fieldConfidence: Partial<Record<string, number>>;
  /** Field values AFTER format validation — a malformed CNIC is already null. */
  values: Partial<Record<string, string | null>>;
  backScanned: boolean;
  presentAddress: DecisionAddressBlock | null;
  permanentAddress: DecisionAddressBlock | null;
  /** The bar an address block must clear to be shown. */
  addressConfidenceMin: number;
}

export type ExtractionDecision =
  | {
      kind: "wrong_side";
      failure: SideFailure;
      /** The side the citizen must photograph again, first. */
      retake: "front" | "back";
      /** True only for a swap, where neither photo is in the right slot. */
      retakeBoth: boolean;
    }
  | {
      kind: "rejected";
      failure: GateFailure;
      affectedSide: AffectedSide;
    }
  | {
      kind: "accepted";
      acceptedFields: string[];
      droppedFields: string[];
      /** Blocks that cleared the confidence bar. Null when withheld or absent. */
      presentAddress: DecisionAddressBlock | null;
      permanentAddress: DecisionAddressBlock | null;
      addressOutcome: AddressOutcome;
      addressNeedsManualEntry: boolean;
    };

/**
 * An address block is only passed on when the back was actually photographed
 * AND the model was confident about what it read there. A block failing either
 * test is dropped entirely rather than shown with a caveat — the citizen types
 * their address on the Address step instead, which is a correct outcome, where
 * a half-read Urdu line silently becomes a wrong one.
 */
function acceptedAddress(
  block: DecisionAddressBlock | null,
  backScanned: boolean,
  minimum: number,
): DecisionAddressBlock | null {
  if (!block || !backScanned) return null;
  if (block.confidence < minimum) return null;
  return block;
}

export function decideExtraction(input: DecisionInput): ExtractionDecision {
  // 1. Is this even the side we asked for?
  const sides = checkSubmittedSides({
    front: input.frontImageSide,
    back: input.backImageSide,
    backSubmitted: input.backScanned,
  });

  if (!sides.ok && sides.failure && sides.retake) {
    return {
      kind: "wrong_side",
      failure: sides.failure,
      retake: sides.retake,
      retakeBoth: sides.retakeBoth,
    };
  }

  // 2. Are the values safe to show?
  const gate = evaluateExtractionConfidence({
    readable: input.readable,
    frontReadable: input.frontReadable,
    backReadable: input.backReadable,
    confidence: input.confidence,
    fieldConfidence: input.fieldConfidence,
    values: input.values,
    backScanned: input.backScanned,
    addressBlocks: [input.presentAddress, input.permanentAddress].map((block) => ({
      hasContent: hasAddressContent(block),
      confidence: block?.confidence ?? 0,
    })),
  });

  if (!gate.pass) {
    return {
      kind: "rejected",
      failure: gate.failure ?? "low_confidence",
      affectedSide: gate.affectedSide ?? "unknown",
    };
  }

  // 3. The read passed. Account for the address, out loud.
  const presentAddress = acceptedAddress(
    input.presentAddress,
    input.backScanned,
    input.addressConfidenceMin,
  );
  const permanentAddress = acceptedAddress(
    input.permanentAddress,
    input.backScanned,
    input.addressConfidenceMin,
  );

  const address = evaluateAddressOutcome({
    backScanned: input.backScanned,
    presentAddress,
    permanentAddress,
  });

  return {
    kind: "accepted",
    acceptedFields: gate.acceptedFields,
    droppedFields: gate.droppedFields,
    presentAddress,
    permanentAddress,
    addressOutcome: address.outcome,
    addressNeedsManualEntry: address.needsManualEntry,
  };
}
