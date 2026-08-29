import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessPasswordStrength,
  signInSchema,
  signUpSchema,
} from "../src/lib/validation/auth";

/*
 * These schemas are the single validation contract shared by the browser and
 * the server, so testing them covers both sides at once.
 */

describe("signUpSchema", () => {
  const valid = {
    name: "Ayesha Khan",
    email: "ayesha@example.com",
    password: "CivicAI-Demo-2026",
    confirmPassword: "CivicAI-Demo-2026",
  };

  it("accepts a complete, consistent submission", () => {
    assert.equal(signUpSchema.safeParse(valid).success, true);
  });

  it("rejects mismatched passwords and blames the confirm field", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      confirmPassword: "SomethingElse123",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues[0].path, ["confirmPassword"]);
    assert.match(result.error!.issues[0].message, /do not match/i);
  });

  it("rejects a password shorter than the minimum", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "short",
      confirmPassword: "short",
    });
    assert.equal(result.success, false);
  });

  it("rejects a malformed email address", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "not-an-email" });
    assert.equal(result.success, false);
  });

  it("rejects an empty name", () => {
    const result = signUpSchema.safeParse({ ...valid, name: "" });
    assert.equal(result.success, false);
  });

  it("normalises email casing and whitespace so duplicates cannot slip through", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      email: "  Ayesha@Example.COM  ",
    });

    assert.equal(result.success, true);
    assert.equal(result.data!.email, "ayesha@example.com");
  });
});

describe("signInSchema", () => {
  it("accepts valid credentials", () => {
    const result = signInSchema.safeParse({
      email: "ayesha@example.com",
      password: "anything",
    });
    assert.equal(result.success, true);
  });

  it("requires a password to be present", () => {
    const result = signInSchema.safeParse({
      email: "ayesha@example.com",
      password: "",
    });
    assert.equal(result.success, false);
  });

  it("does not apply the sign-up length policy to sign-in", () => {
    // An existing account may predate a policy change; sign-in must not lock
    // that citizen out before the credentials are even checked.
    const result = signInSchema.safeParse({
      email: "ayesha@example.com",
      password: "old",
    });
    assert.equal(result.success, true);
  });
});

describe("assessPasswordStrength", () => {
  it("reports nothing for an empty field", () => {
    assert.equal(assessPasswordStrength(""), "empty");
  });

  it("rates anything below the minimum length as weak", () => {
    assert.equal(assessPasswordStrength("Ab1!"), "weak");
  });

  it("rates a long, varied password as strong", () => {
    assert.equal(assessPasswordStrength("CivicAI-Demo-2026"), "strong");
  });

  it("rates a moderate password as fair", () => {
    assert.equal(assessPasswordStrength("islamabad1"), "fair");
  });

  it("rates a long single-character-class password as weak", () => {
    assert.equal(assessPasswordStrength("aaaaaaaaaaaa"), "weak");
  });
});
