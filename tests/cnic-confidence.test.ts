import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateExtractionConfidence,
  type ConfidenceGateInput,
} from "../src/lib/cnic-confidence";

/*
 * The gate's whole job is to decide what a citizen is allowed to see. These
 * tests are written from that angle: every case asks "would a wrong value have
 * reached the form?", not "did the function return the right enum".
 */

/** A clean, confident read of both sides — the baseline every case varies from. */
function goodRead(overrides: Partial<ConfidenceGateInput> = {}): ConfidenceGateInput {
  return {
    readable: true,
    frontReadable: true,
    backReadable: true,
    confidence: 0.94,
    fieldConfidence: {
      fullName: 0.96,
      fatherName: 0.93,
      cnicNumber: 0.97,
      dateOfBirth: 0.91,
      gender: 0.99,
    },
    values: {
      fullName: "Muhammad Sami",
      fatherName: "Abdul Rehman",
      cnicNumber: "35202-1234567-1",
      dateOfBirth: "01.01.1990",
      gender: "Male",
      nationality: null,
    },
    backScanned: true,
    addressBlocks: [
      { hasContent: true, confidence: 0.9 },
      { hasContent: true, confidence: 0.88 },
    ],
    ...overrides,
  };
}

describe("evaluateExtractionConfidence", () => {
  it("passes a confident read and accepts every field that had a value", () => {
    const result = evaluateExtractionConfidence(goodRead());

    assert.equal(result.pass, true);
    assert.equal(result.failure, null);
    assert.deepEqual(result.acceptedFields.sort(), [
      "cnicNumber",
      "dateOfBirth",
      "fatherName",
      "fullName",
      "gender",
    ]);
    assert.deepEqual(result.droppedFields, []);
    assert.equal(result.addressWithheld, false);
  });

  it("fails when the model reports it could not read the images", () => {
    const result = evaluateExtractionConfidence(goodRead({ readable: false }));

    assert.equal(result.pass, false);
    assert.equal(result.failure, "unreadable");
  });

  it("passes affectedSide=null on a passing read", () => {
    const result = evaluateExtractionConfidence(goodRead());
    assert.equal(result.pass, true);
    assert.equal(result.affectedSide, null);
  });

  it("fails when overall confidence is under the bar, even with confident fields", () => {
    const result = evaluateExtractionConfidence(goodRead({ confidence: 0.6 }));

    assert.equal(result.pass, false);
    assert.equal(result.failure, "low_confidence");
  });

  it("fails rather than showing a CNIC number the model was unsure of", () => {
    const input = goodRead();
    input.fieldConfidence.cnicNumber = 0.55;
    const result = evaluateExtractionConfidence(input);

    assert.equal(result.pass, false);
    assert.equal(result.failure, "critical_field_unclear");
    assert.ok(result.droppedFields.includes("cnicNumber"));
    assert.ok(!result.acceptedFields.includes("cnicNumber"));
  });

  it("fails when the CNIC number was dropped for being malformed", () => {
    // A number that failed format validation upstream arrives here as null.
    const input = goodRead();
    input.values.cnicNumber = null;
    const result = evaluateExtractionConfidence(input);

    assert.equal(result.pass, false);
    assert.equal(result.failure, "critical_field_unclear");
  });

  /*
   * Spec: front and back are validated independently. Name and CNIC number
   * are only ever printed on the front, so a critical-field failure must
   * always point there — never send a citizen to retake a back that was fine.
   */
  it("points a critical-field failure at the front, specifically", () => {
    const input = goodRead();
    input.fieldConfidence.cnicNumber = 0.4;
    const result = evaluateExtractionConfidence(input);

    assert.equal(result.affectedSide, "front");
  });

  it("points an unreadable-address failure at the back, specifically", () => {
    const result = evaluateExtractionConfidence(
      goodRead({
        backScanned: true,
        addressBlocks: [{ hasContent: true, confidence: 0.3 }],
      }),
    );

    assert.equal(result.pass, false);
    assert.equal(result.failure, "address_unclear");
    assert.equal(result.affectedSide, "back");
  });

  it("drops a single unconfident non-critical field but still passes", () => {
    const input = goodRead();
    input.fieldConfidence.dateOfBirth = 0.4;
    const result = evaluateExtractionConfidence(input);

    assert.equal(result.pass, true);
    assert.deepEqual(result.droppedFields, ["dateOfBirth"]);
    assert.ok(!result.acceptedFields.includes("dateOfBirth"));
  });

  it("treats a field with no confidence score as unconfident, not as certain", () => {
    const input = goodRead();
    delete input.fieldConfidence.fatherName;
    const result = evaluateExtractionConfidence(input);

    assert.equal(result.pass, true);
    assert.deepEqual(result.droppedFields, ["fatherName"]);
  });

  it("does not count a field the card never printed as a dropped field", () => {
    const result = evaluateExtractionConfidence(goodRead());

    // nationality is null in the baseline: absent, not uncertain.
    assert.ok(!result.droppedFields.includes("nationality"));
    assert.ok(!result.acceptedFields.includes("nationality"));
  });

  it("fails when a scanned back yielded address text it could not read cleanly", () => {
    const result = evaluateExtractionConfidence(
      goodRead({
        addressBlocks: [
          { hasContent: true, confidence: 0.42 },
          { hasContent: true, confidence: 0.9 },
        ],
      }),
    );

    assert.equal(result.pass, false);
    assert.equal(result.failure, "address_unclear");
    assert.equal(result.addressWithheld, true);
  });

  it("passes when the scanned back simply carries no address", () => {
    // Nothing printed is not the same as something unreadable — a card with no
    // address must not send the citizen into a retake loop.
    const result = evaluateExtractionConfidence(
      goodRead({
        addressBlocks: [
          { hasContent: false, confidence: 0 },
          { hasContent: false, confidence: 0 },
        ],
      }),
    );

    assert.equal(result.pass, true);
    assert.equal(result.addressWithheld, false);
  });

  it("ignores address confidence entirely when the back was never scanned", () => {
    const result = evaluateExtractionConfidence(
      goodRead({
        backScanned: false,
        addressBlocks: [{ hasContent: true, confidence: 0.1 }],
      }),
    );

    assert.equal(result.pass, true);
    assert.equal(result.failure, null);
  });

  it("reports the most fundamental failure first when several apply at once", () => {
    const result = evaluateExtractionConfidence(
      goodRead({
        readable: false,
        confidence: 0.2,
        addressBlocks: [{ hasContent: true, confidence: 0.1 }],
      }),
    );

    // "I couldn't read the card" is the useful thing to say; the low scores
    // that follow from it are not separate problems to report.
    assert.equal(result.failure, "unreadable");
  });
});

/*
 * Regression coverage for per-side readability -> affectedSide, the signal
 * that makes independent front/back retry precise instead of a guess. Spec
 * scenarios:
 *
 *   FRONT good, BACK bad  -> affectedSide "back"
 *   FRONT bad, BACK good  -> affectedSide "front"
 *   Model gives no signal -> affectedSide "both" (never guessed)
 */
describe("evaluateExtractionConfidence — affectedSide from per-side readability", () => {
  it('reports "front" when only the front was flagged unreadable', () => {
    const result = evaluateExtractionConfidence(
      goodRead({ readable: false, frontReadable: false, backReadable: true }),
    );
    assert.equal(result.affectedSide, "front");
  });

  it('reports "back" when only the back was flagged unreadable', () => {
    const result = evaluateExtractionConfidence(
      goodRead({ readable: false, frontReadable: true, backReadable: false }),
    );
    assert.equal(result.affectedSide, "back");
  });

  it('reports "both" when the model condemns BOTH images explicitly', () => {
    const result = evaluateExtractionConfidence(
      goodRead({ readable: false, frontReadable: false, backReadable: false }),
    );
    assert.equal(result.affectedSide, "both");
  });

  /*
   * "unknown" and "both" must not be the same verdict, and merging them was a
   * real defect. "both" is a positive claim that neither photo is worth
   * keeping, and the retake plan acts on it by discarding both. Reaching that
   * conclusion from an ABSENCE of any per-side signal would throw away a photo
   * the model never complained about.
   */
  it('reports "unknown" — never "both" — when the model gives no per-side signal at all', () => {
    const result = evaluateExtractionConfidence(
      goodRead({ readable: false, frontReadable: null, backReadable: null }),
    );
    assert.equal(result.affectedSide, "unknown");
  });

  it('reports "unknown" when both sides were explicitly reported READABLE', () => {
    // The read failed for some other reason; neither image is implicated.
    const result = evaluateExtractionConfidence(
      goodRead({ confidence: 0.4, frontReadable: true, backReadable: true }),
    );
    assert.equal(result.affectedSide, "unknown");
  });

  it("does not let a good back mask a bad front on the low_confidence path too", () => {
    const result = evaluateExtractionConfidence(
      goodRead({ confidence: 0.5, frontReadable: false, backReadable: true }),
    );
    assert.equal(result.failure, "low_confidence");
    assert.equal(result.affectedSide, "front");
  });
});
