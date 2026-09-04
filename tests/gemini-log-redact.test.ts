import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clip,
  MAX_TEXT,
  summariseContents,
} from "../src/services/gemini/log-redact";

/*
 * The Gemini transcript is written to disk, and the requests it summarises
 * carry photographs of citizens' identity cards. So the rule that matters most
 * here is a negative one: image data must never reach the log, however the
 * SDK's `contents` happen to be shaped on the day.
 *
 * Tested against log-redact.ts rather than log.ts because the latter imports
 * "server-only", which throws outside a Next.js bundle — the same split
 * gov-env.test.ts uses for env-schema.ts.
 */

describe("summariseContents", () => {
  it("keeps prompt text verbatim", () => {
    const contents = [{ role: "user", parts: [{ text: "Read this CNIC." }] }];

    assert.deepEqual(summariseContents(contents), [
      { kind: "text", text: "Read this CNIC." },
    ]);
  });

  it("never lets image data reach the log", () => {
    // The whole point of the module. A CNIC photograph is several megabytes of
    // base64 and the most sensitive thing passing through the gate.
    const data = "A".repeat(4000);
    const contents = [
      {
        role: "user",
        parts: [{ text: "Front of the card." }, { inlineData: { mimeType: "image/jpeg", data } }],
      },
    ];

    const summary = summariseContents(contents);
    const serialised = JSON.stringify(summary);

    assert.equal(serialised.includes(data), false);
    assert.equal(serialised.includes("AAAA"), false);
    assert.deepEqual(summary[1], { kind: "binary", mimeType: "image/jpeg", bytes: 3000 });
  });

  it("reports an unknown mime type rather than dropping the part", () => {
    // A part that is silently omitted is worse than one labelled "unknown":
    // the log would then imply no image was sent at all.
    const summary = summariseContents([{ parts: [{ inlineData: { data: "AAAA" } }] }]);

    assert.deepEqual(summary, [{ kind: "binary", mimeType: "unknown", bytes: 3 }]);
  });

  it("walks every shape the SDK accepts for `contents`", () => {
    const expected = [{ kind: "text", text: "hello" }];

    // A bare part, an array of parts, and a {role, parts} entry all appear in
    // the five call sites behind this gate.
    assert.deepEqual(summariseContents({ text: "hello" }), expected);
    assert.deepEqual(summariseContents([{ text: "hello" }]), expected);
    assert.deepEqual(summariseContents([{ role: "user", parts: [{ text: "hello" }] }]), expected);
  });

  it("keeps multi-part prompts in the order they were sent", () => {
    const contents = [
      {
        role: "user",
        parts: [
          { text: "instructions" },
          { text: "Image 1: front." },
          { inlineData: { mimeType: "image/png", data: "AAAAAAAA" } },
          { text: "Image 2: back." },
        ],
      },
    ];

    assert.deepEqual(
      summariseContents(contents).map((part) =>
        part.kind === "text" ? part.text : `<${part.mimeType}>`,
      ),
      ["instructions", "Image 1: front.", "<image/png>", "Image 2: back."],
    );
  });

  it("survives malformed input instead of throwing", () => {
    // The logger must never be able to break a citizen's registration.
    assert.deepEqual(summariseContents(null), []);
    assert.deepEqual(summariseContents(undefined), []);
    assert.deepEqual(summariseContents("a string"), []);
    assert.deepEqual(summariseContents([null, 42, { parts: null }]), []);
  });

  it("truncates a runaway prompt and says that it did", () => {
    const summary = summariseContents([{ text: "x".repeat(MAX_TEXT + 500) }]);
    const part = summary[0];

    assert.equal(part.kind, "text");
    if (part.kind !== "text") return;

    assert.ok(part.text.includes("truncated 500 more characters"));
    assert.ok(part.text.length < MAX_TEXT + 200);
  });
});

describe("clip", () => {
  it("leaves anything within the limit exactly as it was", () => {
    assert.equal(clip("short"), "short");
    assert.equal(clip("y".repeat(MAX_TEXT)), "y".repeat(MAX_TEXT));
  });

  it("marks a truncation so a shortened entry cannot be mistaken for the whole", () => {
    const clipped = clip("z".repeat(MAX_TEXT + 1));

    assert.ok(clipped.startsWith("z".repeat(100)));
    assert.ok(clipped.endsWith("…[truncated 1 more characters]"));
  });
});
