import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { carryOverAddresses } from "../src/lib/registration/address-carryover";
import type { CnicAddressData } from "../src/lib/registration/schema";

const block = (raw: string): CnicAddressData => ({
  raw,
  houseNumber: null,
  streetOrMohalla: null,
  sector: null,
  district: null,
  city: null,
  confidence: 0.95,
});

const PRESENT = block("مکان نمبر 47، محلہ شادمان کالونی، ضلع لاہور");
const PERMANENT = block("مکان نمبر 8، محلہ چاہ میراں، ضلع رحیم یار خان");
const NONE = { present: null, permanent: null };

/*
 * Regression tests for the "worked once, then never again" bug: an address
 * read correctly on the first scan was wiped by any later save of the identity
 * step, because the session merge wrote null over it.
 */
describe("carryOverAddresses", () => {
  it("keeps a stored address when a later save carries none for the same card", () => {
    const result = carryOverAddresses(
      NONE,
      { present: PRESENT, permanent: PERMANENT },
      true,
    );

    assert.equal(result.present?.raw, PRESENT.raw);
    assert.equal(result.permanent?.raw, PERMANENT.raw);
  });

  it("lets a freshly-read address replace the stored one", () => {
    const rescanned = block("مکان نمبر 90، ضلع ملتان");
    const result = carryOverAddresses(
      { present: rescanned, permanent: null },
      { present: PRESENT, permanent: PERMANENT },
      true,
    );

    assert.equal(result.present?.raw, rescanned.raw);
    // The permanent side was not re-read, so the stored one stands.
    assert.equal(result.permanent?.raw, PERMANENT.raw);
  });

  /*
   * The safety condition. Carrying an address across a change of CNIC number
   * would attach one person's address to another person's identity.
   */
  it("discards a stored address when the card is a different one", () => {
    const result = carryOverAddresses(
      NONE,
      { present: PRESENT, permanent: PERMANENT },
      false,
    );

    assert.deepEqual(result, NONE);
  });

  it("still accepts a new card's own address on the save that changes cards", () => {
    const fresh = block("مکان نمبر 3، ضلع پشاور");
    const result = carryOverAddresses(
      { present: fresh, permanent: null },
      { present: PRESENT, permanent: PERMANENT },
      false,
    );

    assert.equal(result.present?.raw, fresh.raw);
    assert.equal(result.permanent, null);
  });

  it("decides each side independently", () => {
    const result = carryOverAddresses(
      { present: null, permanent: PERMANENT },
      { present: PRESENT, permanent: null },
      true,
    );

    assert.equal(result.present?.raw, PRESENT.raw);
    assert.equal(result.permanent?.raw, PERMANENT.raw);
  });

  it("returns nulls when there is nothing incoming and nothing stored", () => {
    assert.deepEqual(carryOverAddresses(NONE, undefined, true), NONE);
    assert.deepEqual(carryOverAddresses(NONE, {}, true), NONE);
  });
});
