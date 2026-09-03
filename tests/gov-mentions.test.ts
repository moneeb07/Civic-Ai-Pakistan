import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMentions, searchMentionable } from "../src/lib/gov/mentions";

const WATER = [
  { id: "m-ali", displayName: "Ali Raza", memberCode: "CDA-10004" },
  { id: "m-ahmed", displayName: "Ahmed Nawaz", memberCode: "CDA-10005" },
  { id: "m-sara", displayName: "Sara Bilal", memberCode: "CDA-10006" },
  { id: "m-hassan", displayName: "Hassan Tariq", memberCode: "CDA-10007" },
];

describe("resolveMentions", () => {
  it("resolves a first-name mention to the right member", () => {
    const found = resolveMentions("@Ahmed Please inspect this location.", WATER);

    assert.equal(found.length, 1);
    assert.equal(found[0].memberId, "m-ahmed");
  });

  it("resolves a full-name mention", () => {
    const found = resolveMentions("Adding @Hassan Tariq to this thread.", WATER);
    assert.equal(found[0]?.memberId, "m-hassan");
  });

  it("resolves several mentions in one message", () => {
    const found = resolveMentions("@Ali and @Sara please both review this.", WATER);
    assert.deepEqual(found.map((m) => m.memberId).sort(), ["m-ali", "m-sara"]);
  });

  it("resolves a member code", () => {
    const found = resolveMentions("@CDA-10006 can you confirm?", WATER);
    assert.equal(found[0]?.memberId, "m-sara");
  });

  it("does not swallow trailing punctuation into the name", () => {
    const found = resolveMentions("@Ahmed, please check the evidence.", WATER);
    assert.equal(found[0]?.memberId, "m-ahmed");
  });

  it("mentions each member only once however often they are named", () => {
    const found = resolveMentions("@Ali @Ali @Ali Raza look at this", WATER);
    assert.equal(found.length, 1);
  });

  /*
   * The security rule. A member of another department must not be reachable by
   * typing their name — it would notify them about work they cannot open, and
   * would let anyone probe for who exists elsewhere in the authority.
   */
  it("never resolves someone outside the permitted member list", () => {
    const found = resolveMentions("@Fahad please take a look", WATER);
    assert.deepEqual(found, []);
  });

  it("resolves nothing when the author may mention nobody", () => {
    assert.deepEqual(resolveMentions("@Ali hello", []), []);
  });

  it("ignores text that merely looks like an address", () => {
    const found = resolveMentions("email us at office@cda.gov.pk for details", WATER);
    assert.deepEqual(found, []);
  });

  /*
   * Two people called Ahmed: guessing one would put the wrong colleague's name
   * on the message, so it resolves to neither and the author can disambiguate.
   */
  it("declines an ambiguous first name rather than guessing", () => {
    const twoAhmeds = [
      ...WATER,
      { id: "m-ahmed2", displayName: "Ahmed Raza", memberCode: "CDA-10099" },
    ];

    assert.deepEqual(resolveMentions("@Ahmed please check", twoAhmeds), []);
    // The full name is still unambiguous and must still work.
    assert.equal(
      resolveMentions("@Ahmed Raza please check", twoAhmeds)[0]?.memberId,
      "m-ahmed2",
    );
  });

  it("prefers the longest matching name", () => {
    const found = resolveMentions("@Ali Raza check this", WATER);
    assert.equal(found[0]?.memberId, "m-ali");
    assert.equal(found[0]?.matched, "Ali Raza");
  });
});

describe("searchMentionable", () => {
  it("matches on name and on member code", () => {
    assert.equal(searchMentionable("sar", WATER)[0]?.id, "m-sara");
    assert.equal(searchMentionable("10007", WATER)[0]?.id, "m-hassan");
  });

  it("returns the roster when the query is empty", () => {
    assert.equal(searchMentionable("", WATER).length, WATER.length);
  });

  it("returns nothing for a name that is not in the list", () => {
    assert.deepEqual(searchMentionable("fahad", WATER), []);
  });
});
