import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { strictify } from "../src/services/ai/json-schema";

/*
 * These rules are not stylistic. A schema that breaks them is rejected with a
 * 400 before the model sees the image, and the message says nothing about
 * schemas — the citizen is simply told their photograph could not be checked.
 * That is the specific failure this function exists to make impossible, so the
 * tests are written against the shapes the services actually send.
 */

describe("strictify", () => {
  it("adds the two things strict mode demands of every object", () => {
    const out = strictify({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
    }) as Record<string, unknown>;

    assert.equal(out.additionalProperties, false);
    assert.deepEqual(out.required, ["a", "b"]);
  });

  it("promotes every property to required, not just the ones already listed", () => {
    /*
     * The exact shape that failed on OpenAI: eleven properties, four required.
     * Under strict mode a partial `required` is not a weaker constraint, it is
     * an invalid schema.
     */
    const out = strictify({
      type: "object",
      properties: {
        isPakistaniCnic: { type: "boolean" },
        side: { type: ["string", "null"] },
        readability: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["isPakistaniCnic", "readability"],
    }) as Record<string, unknown>;

    assert.deepEqual(out.required, ["isPakistaniCnic", "side", "readability", "confidence"]);
  });

  it("reaches nested objects", () => {
    // fieldConfidence sits one level down, and strict mode judges it too.
    const out = strictify({
      type: "object",
      properties: {
        fieldConfidence: {
          type: "object",
          properties: { name: { type: "number" }, gender: { type: "number" } },
        },
      },
    }) as { properties: { fieldConfidence: Record<string, unknown> } };

    assert.equal(out.properties.fieldConfidence.additionalProperties, false);
    assert.deepEqual(out.properties.fieldConfidence.required, ["name", "gender"]);
  });

  it("reaches objects inside arrays", () => {
    const out = strictify({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" } } },
        },
      },
    }) as { properties: { rows: { items: Record<string, unknown> } } };

    assert.equal(out.properties.rows.items.additionalProperties, false);
    assert.deepEqual(out.properties.rows.items.required, ["id"]);
  });

  it("treats a nullable object as an object", () => {
    const out = strictify({
      type: ["object", "null"],
      properties: { a: { type: "string" } },
    }) as Record<string, unknown>;

    assert.equal(out.additionalProperties, false);
  });

  it("leaves nullability alone", () => {
    /*
     * Optionality under strict mode is expressed in the TYPE, never by leaving
     * a property out of `required`. Rewriting these would change what the
     * model is allowed to answer, which is a different thing entirely from
     * satisfying the provider's rules.
     */
    const out = strictify({
      type: "object",
      properties: { side: { type: ["string", "null"] } },
    }) as { properties: { side: { type: unknown } } };

    assert.deepEqual(out.properties.side.type, ["string", "null"]);
  });

  it("does not invent properties on an object that declares none", () => {
    // A bare {"type":"object"} has nothing to require; adding an empty
    // `required` would be noise, and `additionalProperties: false` on a node
    // with no properties would forbid every possible value.
    const out = strictify({ type: "object" }) as Record<string, unknown>;

    assert.equal("additionalProperties" in out, false);
    assert.equal("required" in out, false);
  });

  it("leaves non-object nodes untouched", () => {
    assert.deepEqual(strictify({ type: "string", enum: ["a", "b"] }), {
      type: "string",
      enum: ["a", "b"],
    });
    assert.equal(strictify("plain"), "plain");
    assert.equal(strictify(null), null);
  });

  it("never mutates the schema it was given", () => {
    /*
     * The services hold their schemas as module-level constants. Mutating one
     * would leak strict-mode rules into every later request, including those
     * to providers that enforce nothing — a bug that would only surface as
     * strange behaviour after an unrelated provider switch.
     */
    const original = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    const snapshot = JSON.parse(JSON.stringify(original));

    strictify(original);

    assert.deepEqual(original, snapshot);
  });

  it("is idempotent", () => {
    // A schema already written for strict mode must survive unchanged, so
    // running it through twice is not a different request from running it once.
    const already = {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    };

    assert.deepEqual(strictify(already), already);
    assert.deepEqual(strictify(strictify(already)), already);
  });
});
