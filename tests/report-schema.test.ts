import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CIVIC_CATEGORIES,
  describeTextPayloadSchema,
  generatedComplaintSchema,
  locationPayloadSchema,
  reportPatchSchema,
  transcriptionResultSchema,
  visionResultSchema,
} from "../src/lib/report/schema";

/*
 * These validate the exact boundary the AI providers cross: a Gemini response
 * is untrusted input the instant it leaves the model, whatever the prompt
 * asked for. A malformed or out-of-range response must be REJECTED here, not
 * passed through — this is what test #14 ("malformed AI response is
 * rejected") is actually checking.
 */

describe("visionResultSchema", () => {
  it("accepts a well-formed detection", () => {
    const result = visionResultSchema.safeParse({
      detected: true,
      category: "POTHOLE",
      confidence: 0.87,
      evidence: ["depression in the road surface"],
      readable: true,
    });
    assert.equal(result.success, true);
  });

  it("accepts a null category when nothing was detected", () => {
    const result = visionResultSchema.safeParse({
      detected: false,
      category: null,
      confidence: 0.1,
      evidence: [],
      readable: true,
    });
    assert.equal(result.success, true);
  });

  it("rejects a category outside the fixed enum — the model cannot invent a new class", () => {
    const result = visionResultSchema.safeParse({
      detected: true,
      category: "ALIEN_INVASION",
      confidence: 0.9,
      evidence: [],
      readable: true,
    });
    assert.equal(result.success, false);
  });

  it("rejects confidence outside 0-1", () => {
    const result = visionResultSchema.safeParse({
      detected: true,
      category: "POTHOLE",
      confidence: 1.4,
      evidence: [],
      readable: true,
    });
    assert.equal(result.success, false);
  });

  it("rejects a response missing required fields", () => {
    const result = visionResultSchema.safeParse({ detected: true });
    assert.equal(result.success, false);
  });

  it("every category the prompt is told about is a real, accepted enum value", () => {
    for (const category of CIVIC_CATEGORIES) {
      const result = visionResultSchema.safeParse({
        detected: true,
        category,
        confidence: 0.5,
        evidence: [],
        readable: true,
      });
      assert.equal(result.success, true, `${category} should be a valid category`);
    }
  });
});

describe("transcriptionResultSchema", () => {
  it("accepts a confident transcript", () => {
    const result = transcriptionResultSchema.safeParse({
      transcript: "Yahan road mein bara gaddha hai.",
      language: "Urdu",
      confident: true,
    });
    assert.equal(result.success, true);
  });

  it("accepts a null transcript for an inaudible recording", () => {
    const result = transcriptionResultSchema.safeParse({
      transcript: null,
      language: null,
      confident: false,
    });
    assert.equal(result.success, true);
  });

  it("rejects a transcript longer than the sanity cap", () => {
    const result = transcriptionResultSchema.safeParse({
      transcript: "a".repeat(3000),
      language: null,
      confident: true,
    });
    assert.equal(result.success, false);
  });
});

describe("generatedComplaintSchema", () => {
  it("accepts a well-formed complaint", () => {
    const result = generatedComplaintSchema.safeParse({
      title: "Large pothole on road",
      description: "There is a large pothole on the road.",
      severity: "MEDIUM",
    });
    assert.equal(result.success, true);
  });

  it("rejects a severity outside LOW/MEDIUM/HIGH — no invented priority tiers", () => {
    const result = generatedComplaintSchema.safeParse({
      title: "Large pothole",
      description: "There is a pothole.",
      severity: "CRITICAL",
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty title or description", () => {
    assert.equal(
      generatedComplaintSchema.safeParse({ title: "", description: "x", severity: "LOW" }).success,
      false,
    );
    assert.equal(
      generatedComplaintSchema.safeParse({ title: "x", description: "", severity: "LOW" }).success,
      false,
    );
  });

  it("rejects a description far longer than a short complaint should ever be", () => {
    const result = generatedComplaintSchema.safeParse({
      title: "Pothole",
      description: "a".repeat(5000),
      severity: "LOW",
    });
    assert.equal(result.success, false);
  });
});

describe("locationPayloadSchema", () => {
  it("accepts a valid GPS payload", () => {
    const result = locationPayloadSchema.safeParse({
      mode: "gps",
      latitude: 33.6844,
      longitude: 73.0479,
      accuracyMeters: 12,
    });
    assert.equal(result.success, true);
  });

  it("accepts a GPS payload with accuracy omitted", () => {
    const result = locationPayloadSchema.safeParse({
      mode: "gps",
      latitude: 33.6844,
      longitude: 73.0479,
    });
    assert.equal(result.success, true);
  });

  it("rejects an out-of-range latitude", () => {
    const result = locationPayloadSchema.safeParse({
      mode: "gps",
      latitude: 200,
      longitude: 73.0479,
    });
    assert.equal(result.success, false);
  });

  it("accepts a manual location label", () => {
    const result = locationPayloadSchema.safeParse({ mode: "manual", label: "G-10, Islamabad" });
    assert.equal(result.success, true);
  });

  it("rejects an empty manual label", () => {
    const result = locationPayloadSchema.safeParse({ mode: "manual", label: "" });
    assert.equal(result.success, false);
  });

  it("rejects a payload that names neither mode", () => {
    const result = locationPayloadSchema.safeParse({ latitude: 1, longitude: 1 });
    assert.equal(result.success, false);
  });
});

describe("describeTextPayloadSchema", () => {
  it("rejects whitespace-only text", () => {
    assert.equal(describeTextPayloadSchema.safeParse({ text: "   " }).success, false);
  });

  it("accepts real text", () => {
    assert.equal(
      describeTextPayloadSchema.safeParse({ text: "There is a pothole." }).success,
      true,
    );
  });
});

describe("reportPatchSchema", () => {
  it("accepts a partial patch touching only one field", () => {
    const result = reportPatchSchema.safeParse({ severity: "HIGH" });
    assert.equal(result.success, true);
  });

  it("accepts an empty patch", () => {
    assert.equal(reportPatchSchema.safeParse({}).success, true);
  });

  it("rejects a category outside the fixed enum from a citizen edit too", () => {
    const result = reportPatchSchema.safeParse({ category: "SOMETHING_ELSE" });
    assert.equal(result.success, false);
  });

  it("rejects an unknown extra field being silently accepted as a category", () => {
    // Zod's default (non-strict) object parsing ignores unknown keys rather
    // than erroring — this pins that the KNOWN fields still validate
    // correctly alongside one, so a stray field can't smuggle bad data in
    // under a name the schema does check.
    const result = reportPatchSchema.safeParse({ severity: "LOW", somethingUnexpected: "x" });
    assert.equal(result.success, true);
    assert.equal((result.data as { severity: string }).severity, "LOW");
    assert.ok(!("somethingUnexpected" in (result.data as object)));
  });
});
