import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateAddressOutcome,
  hasAddressContent,
  isAddressUsable,
  type AddressBlockShape,
} from "../src/lib/cnic-address-outcome";

const EMPTY: AddressBlockShape = {
  raw: null,
  houseNumber: null,
  streetOrMohalla: null,
  sector: null,
  district: null,
  city: null,
};

const block = (fields: Partial<AddressBlockShape>): AddressBlockShape => ({
  ...EMPTY,
  ...fields,
});

/*
 * A scan that PASSES the accuracy gate can still come back with no address:
 * the gate only fails a read when address text was found and could not be read
 * cleanly. A back photo that yields nothing at all is not a gate failure.
 *
 * Left unhandled that produced the worst possible outcome — a screen reporting
 * success, an empty address, no reason given and nothing to press. These tests
 * pin down that every passing scan still says something actionable.
 */
describe("evaluateAddressOutcome", () => {
  it("reports a clean read as available, with no manual entry needed", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({ raw: "مکان نمبر 123، گلی نمبر 5، محلہ رحمان پورہ، ملتان" }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "available");
    assert.equal(result.needsManualEntry, false);
  });

  // -- The silent-failure case -------------------------------------------
  it("reports a scanned back that yielded nothing as unreadable, not as success", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: null,
      permanentAddress: null,
    });

    assert.equal(result.outcome, "unreadable");
    assert.equal(result.needsManualEntry, true);
  });

  it("treats blocks that exist but are entirely empty as unreadable too", () => {
    // A model can return the object shape with every field null.
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({}),
      permanentAddress: block({}),
    });

    assert.equal(result.outcome, "unreadable");
    assert.equal(result.needsManualEntry, true);
  });

  it("treats whitespace-only values as no content at all", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({ raw: "   ", city: "\t\n " }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "unreadable");
  });

  // -- Never scanned ------------------------------------------------------
  /*
   * Distinct wording matters: "you didn't show us the back" and "we looked and
   * couldn't read it" need completely different instructions, and collapsing
   * them into one blank was the original defect.
   */
  it("distinguishes a back that was never scanned from one that failed", () => {
    const result = evaluateAddressOutcome({
      backScanned: false,
      presentAddress: null,
      permanentAddress: null,
    });

    assert.equal(result.outcome, "not_printed");
    assert.equal(result.needsManualEntry, true);
  });

  it("still reports not_printed when a stale address block is passed with no back scan", () => {
    const result = evaluateAddressOutcome({
      backScanned: false,
      presentAddress: block({ raw: "left over from an earlier read" }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "not_printed");
  });

  // -- Partial reads ------------------------------------------------------
  it("reports a fragment as partial, not as a usable address", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({ houseNumber: "123" }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "partial");
    assert.equal(result.needsManualEntry, true);
  });

  it("reports a lone city with no street as partial", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({ city: "Multan" }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "partial");
  });

  it("accepts a split address with both a street and a locality", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: block({ streetOrMohalla: "گلی نمبر 5", city: "ملتان" }),
      permanentAddress: null,
    });

    assert.equal(result.outcome, "available");
  });

  // -- One good block is enough -------------------------------------------
  it("is satisfied when only the permanent address came through", () => {
    const result = evaluateAddressOutcome({
      backScanned: true,
      presentAddress: null,
      permanentAddress: block({ raw: "مستقل پتہ: گلی نمبر 7، لاہور" }),
    });

    assert.equal(result.outcome, "available");
    assert.equal(result.needsManualEntry, false);
  });
});

describe("isAddressUsable", () => {
  /*
   * The card prints the address as one free-text line, so a faithful
   * transcription of that line IS the address. Rejecting it because the
   * model's own attempt to split it into parts came out empty would fail a
   * good read for missing a convenience.
   */
  it("accepts a raw line on its own, even with no split at all", () => {
    assert.equal(isAddressUsable(block({ raw: "مکان نمبر 12، محلہ اسلام پورہ، ساہیوال" })), true);
  });

  it("rejects a lone house number", () => {
    assert.equal(isAddressUsable(block({ houseNumber: "123" })), false);
  });

  it("rejects an empty block and a null block", () => {
    assert.equal(isAddressUsable(block({})), false);
    assert.equal(isAddressUsable(null), false);
    assert.equal(isAddressUsable(undefined), false);
  });

  it("accepts an Islamabad-style sector paired with a street", () => {
    assert.equal(isAddressUsable(block({ streetOrMohalla: "Street 12", sector: "G-11/3" })), true);
  });
});

describe("hasAddressContent", () => {
  it("is true for any single non-empty field", () => {
    assert.equal(hasAddressContent(block({ district: "Multan" })), true);
  });

  it("is false for an empty, whitespace-only, or absent block", () => {
    assert.equal(hasAddressContent(block({})), false);
    assert.equal(hasAddressContent(block({ raw: "  " })), false);
    assert.equal(hasAddressContent(null), false);
  });

  /*
   * hasContent is a strictly weaker test than isUsable — a fragment has
   * content but is not usable. Anything usable must also have content, or the
   * outcome logic above could report "available" for an empty read.
   */
  it("is implied by usability, never the other way round", () => {
    const samples = [
      block({ raw: "a line" }),
      block({ houseNumber: "1" }),
      block({ streetOrMohalla: "Gali 4", city: "Lahore" }),
      block({}),
    ];

    for (const sample of samples) {
      if (isAddressUsable(sample)) {
        assert.ok(hasAddressContent(sample), "usable block reported as having no content");
      }
    }
  });
});
