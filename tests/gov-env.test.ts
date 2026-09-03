import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGovEnv } from "../src/lib/gov/env-schema";

/*
 * The env rules are what stand between a typo in .env.local and an SMTP client
 * receiving `undefined`. These pin the behaviours the invite flow depends on:
 * the delivery toggle really is a boolean, and a malformed value fails loudly
 * instead of defaulting to something plausible.
 *
 * Tested against env-schema.ts rather than env.ts because the latter imports
 * "server-only", which throws outside a Next.js bundle — the same split the
 * citizen side uses for report-image-utils.ts. No process.env mutation is
 * needed, so these tests cannot leak state into their neighbours.
 */

describe("parseGovEnv", () => {
  it("defaults EMAIL_ROUTING_ENABLED to false, so a fresh clone logs invites rather than sending them", () => {
    assert.equal(parseGovEnv({}).EMAIL_ROUTING_ENABLED, false);
  });

  it("parses the flag into a real boolean, not the string 'false'", () => {
    assert.equal(parseGovEnv({ EMAIL_ROUTING_ENABLED: "false" }).EMAIL_ROUTING_ENABLED, false);
    assert.equal(parseGovEnv({ EMAIL_ROUTING_ENABLED: "true" }).EMAIL_ROUTING_ENABLED, true);
  });

  it("rejects a value that isn't exactly true or false", () => {
    // "yes" and "1" look enabled to a human but would be falsy under a naive
    // string check — refusing them is safer than guessing which was meant.
    assert.throws(
      () => parseGovEnv({ EMAIL_ROUTING_ENABLED: "yes" }),
      /EMAIL_ROUTING_ENABLED/,
    );
    assert.throws(() => parseGovEnv({ EMAIL_ROUTING_ENABLED: "1" }), /EMAIL_ROUTING_ENABLED/);
  });

  it("defaults the SMTP port and sender rather than leaving them undefined", () => {
    const env = parseGovEnv({});
    assert.equal(env.SMTP_PORT, 587);
    assert.equal(env.SMTP_FROM, "CivicAI <noreply@civicai.local>");
  });

  it("coerces a numeric port from its string form", () => {
    assert.equal(parseGovEnv({ SMTP_PORT: "2525" }).SMTP_PORT, 2525);
  });

  it("rejects a port outside the valid range", () => {
    assert.throws(() => parseGovEnv({ SMTP_PORT: "70000" }), /SMTP_PORT/);
    assert.throws(() => parseGovEnv({ SMTP_PORT: "0" }), /SMTP_PORT/);
  });

  it("falls back to localhost for the invite link base URL", () => {
    assert.equal(parseGovEnv({}).BETTER_AUTH_URL, "http://localhost:3000");
  });

  it("rejects a base URL that isn't a URL — invite links are built by concatenating it", () => {
    assert.throws(() => parseGovEnv({ BETTER_AUTH_URL: "localhost:3000" }), /BETTER_AUTH_URL/);
  });

  it("treats an empty string as absent, so a blank line in .env doesn't fail validation", () => {
    const env = parseGovEnv({ SMTP_HOST: "", SMTP_FROM: "" });
    assert.equal(env.SMTP_HOST, undefined);
    assert.equal(env.SMTP_FROM, "CivicAI <noreply@civicai.local>");
  });

  it("never puts a secret in the error message", () => {
    assert.throws(
      () => parseGovEnv({ EMAIL_ROUTING_ENABLED: "maybe", SMTP_PASS: "hunter2" }),
      (error: unknown) => error instanceof Error && !error.message.includes("hunter2"),
    );
  });
});
