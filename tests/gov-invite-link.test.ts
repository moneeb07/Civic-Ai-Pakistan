import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractInviteToken } from "../src/lib/gov/invite-link";

/*
 * The onboarding box takes "your invitation link", but people paste whatever
 * their mail client gave them. These are the shapes that actually turn up.
 */

const TOKEN = "a".repeat(8) + "b3f9c1d2e4" + "0".repeat(46);

describe("extractInviteToken", () => {
  it("takes a bare token", () => {
    assert.equal(extractInviteToken(TOKEN), TOKEN);
  });

  it("takes the token out of a full invitation URL", () => {
    assert.equal(
      extractInviteToken(`https://civicai.pk/gov/invite/${TOKEN}`),
      TOKEN,
    );
  });

  it("survives a tracking query string", () => {
    assert.equal(
      extractInviteToken(`https://civicai.pk/gov/invite/${TOKEN}?utm_source=email`),
      TOKEN,
    );
  });

  it("survives the whitespace a mail client wraps a link in", () => {
    assert.equal(extractInviteToken(`\n  ${TOKEN}\t\n`), TOKEN);
  });

  it("survives the angle brackets plain-text mail adds", () => {
    assert.equal(
      extractInviteToken(`<https://civicai.pk/gov/invite/${TOKEN}>`),
      TOKEN,
    );
  });

  it("lowercases, because the stored token is lowercase and lookup compares exactly", () => {
    assert.equal(extractInviteToken(TOKEN.toUpperCase()), TOKEN);
  });

  // -- Nothing to find -------------------------------------------------------
  it("returns null for empty input", () => {
    assert.equal(extractInviteToken(""), null);
  });

  it("returns null for prose with no token in it", () => {
    assert.equal(extractInviteToken("please send me an invitation"), null);
  });

  it("returns null for a token that is too short", () => {
    assert.equal(extractInviteToken("a".repeat(63)), null);
  });

  it("returns null for non-hex characters of the right length", () => {
    assert.equal(extractInviteToken("z".repeat(64)), null);
  });

  /*
   * The one that would be dangerous to get wrong. A longer hex run is some
   * other identifier, and quietly slicing its first 64 characters would send
   * the officer to a confidently wrong invitation rather than telling them the
   * link looked wrong.
   */
  it("refuses a 64-hex run that is part of a longer hex string", () => {
    assert.equal(extractInviteToken("a".repeat(80)), null);
    assert.equal(extractInviteToken(`deadbeef${TOKEN}`), null);
    assert.equal(extractInviteToken(`${TOKEN}deadbeef`), null);
  });

  it("still finds a token bounded by non-hex characters", () => {
    // 'z' and '/' are not hex, so the run is genuinely 64 long.
    assert.equal(extractInviteToken(`z${TOKEN}z`), TOKEN);
    assert.equal(extractInviteToken(`/${TOKEN}/`), TOKEN);
  });
});
