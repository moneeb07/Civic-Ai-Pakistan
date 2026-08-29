import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCnic,
  genderMatchesCnicConvention,
  isValidCnicFormat,
  maskCnic,
  maskEmail,
  maskPhone,
  normaliseCnic,
} from "../src/lib/cnic";

/*
 * Every CNIC in this file is synthetic. No real citizen's number appears in
 * this repository, in fixtures, or in any seed data.
 */

describe("CNIC format validation", () => {
  it("accepts a correctly formatted CNIC", () => {
    assert.equal(isValidCnicFormat("35202-1234567-1"), true);
  });

  it("accepts an unformatted 13-digit CNIC", () => {
    assert.equal(isValidCnicFormat("3520212345671"), true);
  });

  it("rejects too few digits", () => {
    assert.equal(isValidCnicFormat("35202-123456-1"), false);
  });

  it("rejects too many digits", () => {
    assert.equal(isValidCnicFormat("35202-12345678-1"), false);
  });

  it("rejects letters", () => {
    assert.equal(isValidCnicFormat("3520A-1234567-1"), false);
  });

  it("rejects an empty value", () => {
    assert.equal(isValidCnicFormat(""), false);
  });

  it("strips separators when normalising", () => {
    assert.equal(normaliseCnic("35202-1234567-1"), "3520212345671");
  });

  it("formats an unformatted number canonically", () => {
    assert.equal(formatCnic("3520212345671"), "35202-1234567-1");
  });
});

describe("CNIC masking", () => {
  it("hides the seven identifying digits but keeps region and check digit", () => {
    assert.equal(maskCnic("35202-1234567-1"), "35202-*******-1");
  });

  it("never echoes the raw digits", () => {
    const masked = maskCnic("35202-1234567-1");
    assert.equal(masked.includes("1234567"), false);
  });

  it("degrades safely for a malformed value rather than leaking it", () => {
    assert.equal(maskCnic("not-a-cnic"), "*****-*******-*");
  });
});

describe("gender convention check", () => {
  // Advisory only — a convention, never used to block or overwrite.
  it("matches an odd final digit to male", () => {
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", "Male"), true);
  });

  it("matches an even final digit to female", () => {
    assert.equal(genderMatchesCnicConvention("35202-1234567-2", "Female"), true);
  });

  it("flags a mismatch", () => {
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", "Female"), false);
  });

  it("returns null when gender is unknown, rather than guessing", () => {
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", null), null);
  });
});

describe("contact masking", () => {
  it("masks an email but keeps it recognisable", () => {
    const masked = maskEmail("muhammad@example.com");
    assert.equal(masked.startsWith("mu"), true);
    assert.equal(masked.endsWith("@example.com"), true);
    assert.equal(masked.includes("muhammad"), false);
  });

  it("masks all but the last four digits of a phone number", () => {
    const masked = maskPhone("+923001234567");
    assert.equal(masked.endsWith("4567"), true);
    assert.equal(masked.includes("300123"), false);
  });
});
