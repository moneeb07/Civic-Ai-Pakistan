import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { takeRegistrationCookie, takeSessionCookie } from "../mobile/src/api/cookie";
import { planRetake } from "../mobile/src/registration/retake";
import {
  canonicalPhone,
  formatCnic,
  genderMatchesCnicConvention,
  isValidCnicFormat,
  isValidPhone,
  liveFormatCnic,
  maskCnic,
} from "../mobile/src/registration/validation";
import { planRetake as webPlanRetake } from "../src/lib/registration/retake";
import { formatCnic as webFormatCnic, maskCnic as webMaskCnic } from "../src/lib/cnic";
import { contactSchema } from "../src/lib/registration/schema";

/*
 * Citizen signup on the phone reuses the web's endpoints, so the two clients
 * have to agree about what they send. Where the mobile app carries a PORTED
 * copy of a rule, these tests assert it against the web original rather than
 * against a hand-written expectation — a copy that has quietly drifted is the
 * failure mode worth catching, and it is invisible to a typecheck.
 */

describe("takeRegistrationCookie", () => {
  it("picks the registration cookie out of a multi-cookie header", () => {
    const header =
      "better-auth.session_token=abc; Path=/; HttpOnly, civicai.registration=reg123; Path=/; HttpOnly";

    assert.equal(takeRegistrationCookie(header), "civicai.registration=reg123");
  });

  it("matches the registration cookie by exact name", () => {
    /*
     * A substring match would also accept "civicai.registration.backup" and
     * send the wrong id, which the server would read as an expired session.
     */
    const header = "civicai.registrations=nope; Path=/";

    assert.equal(takeRegistrationCookie(header), null);
  });

  it("is not fooled by the comma inside an Expires date", () => {
    const header =
      "civicai.registration=reg123; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/";

    assert.equal(takeRegistrationCookie(header), "civicai.registration=reg123");
  });

  it("does not confuse the two cookies with each other", () => {
    const header =
      "civicai.registration=reg123; Path=/, better-auth.session_token=abc; Path=/";

    assert.equal(takeSessionCookie(header), "better-auth.session_token=abc");
    assert.equal(takeRegistrationCookie(header), "civicai.registration=reg123");
  });

  it("returns null when no registration cookie is present", () => {
    assert.equal(takeRegistrationCookie("better-auth.session_token=abc; Path=/"), null);
    assert.equal(takeRegistrationCookie(""), null);
  });
});

describe("planRetake, ported to mobile", () => {
  /*
   * Exhaustive over the rule's whole input space — four verdicts against every
   * combination of photos on file. Cheap, and it makes drift impossible to
   * miss rather than merely unlikely.
   */
  const verdicts = ["front", "back", "both", "unknown"] as const;
  const onFile = [
    { front: false, back: false },
    { front: true, back: false },
    { front: false, back: true },
    { front: true, back: true },
  ];

  for (const affected of verdicts) {
    for (const files of onFile) {
      it(`agrees with the web for "${affected}" with front=${files.front} back=${files.back}`, () => {
        assert.deepEqual(planRetake(affected, files), webPlanRetake(affected, files));
      });
    }
  }

  it("keeps a good front when only the back was unreadable", () => {
    const plan = planRetake("back", { front: true, back: true });

    assert.equal(plan.retake, "back");
    assert.equal(plan.keeps, "front");
    assert.deepEqual(plan.discards, ["back"]);
  });

  it("discards both when the model called both images unreadable", () => {
    // Keeping the bad back here is the bug that made an address unreadable for
    // ever: every retry re-sent the same unusable image.
    const plan = planRetake("both", { front: true, back: true });

    assert.equal(plan.keeps, null);
    assert.deepEqual(plan.discards, ["front", "back"]);
  });
});

describe("CNIC helpers, ported to mobile", () => {
  const samples = ["3520212345671", "35202-1234567-1", "1730112345678"];

  for (const sample of samples) {
    it(`formats and masks ${sample} exactly as the web does`, () => {
      assert.equal(formatCnic(sample), webFormatCnic(sample));
      assert.equal(maskCnic(sample), webMaskCnic(sample));
    });
  }

  it("accepts a CNIC with or without dashes", () => {
    assert.equal(isValidCnicFormat("35202-1234567-1"), true);
    assert.equal(isValidCnicFormat("3520212345671"), true);
  });

  it("rejects anything that is not thirteen digits", () => {
    assert.equal(isValidCnicFormat("35202-123456-1"), false);
    assert.equal(isValidCnicFormat("35202123456712"), false);
    assert.equal(isValidCnicFormat(""), false);
    assert.equal(isValidCnicFormat("abcde-fghijkl-m"), false);
  });

  it("adds the dashes as the citizen types, and never more than thirteen digits", () => {
    assert.equal(liveFormatCnic("35202"), "35202");
    assert.equal(liveFormatCnic("352021234"), "35202-1234");
    assert.equal(liveFormatCnic("3520212345671"), "35202-1234567-1");
    assert.equal(liveFormatCnic("35202123456719999"), "35202-1234567-1");
  });

  it("treats the gender convention as advisory, never as a verdict", () => {
    // Odd last digit is male by NADRA convention, even is female.
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", "Male"), true);
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", "Female"), false);

    // No opinion is offered when there is nothing to compare.
    assert.equal(genderMatchesCnicConvention("35202-1234567-1", ""), null);
    assert.equal(genderMatchesCnicConvention("352", "Male"), null);
  });
});

describe("phone rules, ported to mobile", () => {
  const accepted = [
    "03001234567",
    "+923001234567",
    "923001234567",
    "0092 300 1234567",
    "+92 300 1234567",
    "0300-1234567",
  ];

  for (const input of accepted) {
    it(`canonicalises ${input} the same way the server does`, () => {
      assert.equal(isValidPhone(input), true);

      // The server's own transform is the reference.
      const server = contactSchema.parse({ phone: input, email: "a@b.com" }).phone;
      assert.equal(canonicalPhone(input), server);
    });
  }

  it("rejects numbers that are not Pakistani mobiles", () => {
    // Landlines, wrong length, and non-3 prefixes all fail.
    assert.equal(isValidPhone("0511234567"), false);
    assert.equal(isValidPhone("030012345"), false);
    assert.equal(isValidPhone("+441234567890"), false);
    assert.equal(canonicalPhone("not a number"), null);
  });
});
