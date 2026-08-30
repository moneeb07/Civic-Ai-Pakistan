import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAddressPrefill } from "../src/lib/registration/address-prefill";
import { addressSchema } from "../src/lib/registration/schema";
import type { CnicAddressData } from "../src/lib/registration/schema";

const PRESENT: CnicAddressData = {
  raw: "مکان نمبر 47، گلی نمبر 12، محلہ شادمان کالونی، ضلع لاہور",
  houseNumber: "مکان نمبر 47",
  streetOrMohalla: "گلی نمبر 12، محلہ شادمان کالونی",
  sector: null,
  district: "ضلع لاہور",
  city: "لاہور",
  confidence: 0.95,
};

const PERMANENT: CnicAddressData = {
  raw: "مکان نمبر 8، محلہ چاہ میراں، ضلع رحیم یار خان",
  houseNumber: "مکان نمبر 8",
  streetOrMohalla: "محلہ چاہ میراں",
  sector: null,
  district: "ضلع رحیم یار خان",
  city: "رحیم یار خان",
  confidence: 0.91,
};

/*
 * The defect these cover: the address WAS being extracted correctly off the
 * back of the card, but the Address step rendered an empty form, so a citizen
 * saw no address and concluded the scan had failed.
 */
describe("buildAddressPrefill", () => {
  it("fills the current-address fields from the CNIC's present address", () => {
    const { values, fromCnic } = buildAddressPrefill(undefined, PRESENT, null);

    assert.equal(values.city, "لاہور");
    assert.equal(values.district, "ضلع لاہور");
    assert.equal(values.houseNumber, "مکان نمبر 47");
    assert.equal(values.street, "گلی نمبر 12، محلہ شادمان کالونی");
    assert.equal(values.residentialAddress, PRESENT.raw);
    assert.equal(fromCnic.current, true);
  });

  it("fills the permanent address into its own field, from the permanent block", () => {
    const { values, fromCnic } = buildAddressPrefill(undefined, PRESENT, PERMANENT);

    assert.equal(values.permanentAddress, PERMANENT.raw);
    assert.equal(fromCnic.permanent, true);
  });

  /*
   * The failure that matters most here: a citizen who has moved has a
   * genuinely different current and permanent address, and putting the wrong
   * one in either box is worse than leaving it blank (spec §13).
   */
  it("never merges or swaps the two addresses", () => {
    const { values } = buildAddressPrefill(undefined, PRESENT, PERMANENT);

    assert.equal(values.residentialAddress, PRESENT.raw);
    assert.equal(values.permanentAddress, PERMANENT.raw);
    assert.notEqual(values.residentialAddress, values.permanentAddress);
  });

  it("preserves the Urdu exactly as printed — no translation, no transliteration", () => {
    const { values } = buildAddressPrefill(undefined, PRESENT, PERMANENT);

    assert.equal(values.residentialAddress, PRESENT.raw);
    assert.match(values.residentialAddress, /[؀-ۿ]/);
    assert.match(values.permanentAddress, /[؀-ۿ]/);
  });

  it("keeps what the citizen already saved and never overwrites it from the card", () => {
    const saved = {
      city: "Islamabad",
      residentialAddress: "House 12, Street 4, G-11/3",
      permanentAddress: "Village Kot Addu",
    };
    const { values, fromCnic } = buildAddressPrefill(saved, PRESENT, PERMANENT);

    assert.equal(values.city, "Islamabad");
    assert.equal(values.residentialAddress, "House 12, Street 4, G-11/3");
    assert.equal(values.permanentAddress, "Village Kot Addu");
    // Nothing came from the card, so nothing is badged as having done.
    assert.equal(fromCnic.permanent, false);
  });

  it("fills only the gaps when the citizen has saved some fields but not others", () => {
    const { values } = buildAddressPrefill({ city: "Multan" }, PRESENT, PERMANENT);

    assert.equal(values.city, "Multan");
    assert.equal(values.district, "ضلع لاہور");
    assert.equal(values.permanentAddress, PERMANENT.raw);
  });

  it("treats a whitespace-only saved value as empty and fills it", () => {
    const { values } = buildAddressPrefill({ city: "   " }, PRESENT, null);
    assert.equal(values.city, "لاہور");
  });

  it("returns a blank form, badged as unfilled, when the back carried no address", () => {
    const { values, fromCnic } = buildAddressPrefill(undefined, null, null);

    assert.equal(values.city, "");
    assert.equal(values.residentialAddress, "");
    assert.equal(values.permanentAddress, "");
    assert.deepEqual(fromCnic, { current: false, permanent: false });
  });

  it("fills the permanent address even when only the permanent block was read", () => {
    const { values, fromCnic } = buildAddressPrefill(undefined, null, PERMANENT);

    assert.equal(values.permanentAddress, PERMANENT.raw);
    assert.equal(values.residentialAddress, "");
    assert.deepEqual(fromCnic, { current: false, permanent: true });
  });
});

describe("addressSchema — permanent address", () => {
  const base = { city: "Lahore", residentialAddress: "House 47, Shadman Colony" };

  it("accepts an Urdu permanent address", () => {
    const result = addressSchema.safeParse({ ...base, permanentAddress: PERMANENT.raw });
    assert.equal(result.success, true);
    assert.equal(result.data?.permanentAddress, PERMANENT.raw);
  });

  it("accepts an omitted or empty permanent address — a card may not carry one", () => {
    assert.equal(addressSchema.safeParse(base).success, true);
    assert.equal(addressSchema.safeParse({ ...base, permanentAddress: "" }).success, true);
  });

  it("rejects a permanent address beyond the stored column's length", () => {
    const result = addressSchema.safeParse({
      ...base,
      permanentAddress: "ا".repeat(301),
    });
    assert.equal(result.success, false);
  });
});
