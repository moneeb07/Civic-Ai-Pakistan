import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { speechLanguages, SPEECH_LANGUAGE_NAMES } from "../src/services/ai/chains";

/*
 * The language a transcription model is told to expect.
 *
 * Left to guess, a model decides from the first seconds of a street recording
 * and often decides wrong — which is how spoken Urdu came back as a Roman
 * approximation belonging to no language. Naming it removes the guess, so the
 * ORDER here is the behaviour, not a detail: Urdu first because that is what
 * citizens speak, Hindi second because it is the nearest usable neighbour when
 * a provider has no Urdu, and nothing else, because a third-best guess is not
 * better than honest auto-detection.
 */

const SAVED = process.env.AI_SPEECH_LANGUAGES;

afterEach(() => {
  if (SAVED === undefined) delete process.env.AI_SPEECH_LANGUAGES;
  else process.env.AI_SPEECH_LANGUAGES = SAVED;
});

describe("speechLanguages", () => {
  it("asks for Urdu first", () => {
    delete process.env.AI_SPEECH_LANGUAGES;
    assert.equal(speechLanguages()[0], "ur");
  });

  it("falls back to Hindi, and only to Hindi", () => {
    /*
     * Hindi earns its place by being mutually intelligible with Urdu in
     * speech. Adding English here would be actively harmful: it is the guess
     * the model already makes when it gives up, and the one that produces the
     * mangling this exists to prevent.
     */
    delete process.env.AI_SPEECH_LANGUAGES;
    assert.deepEqual(speechLanguages(), ["ur", "hi"]);
  });

  it("uses ISO-639-1 codes, which is what the endpoint accepts", () => {
    delete process.env.AI_SPEECH_LANGUAGES;
    for (const code of speechLanguages()) {
      assert.match(code, /^[a-z]{2}$/, `${code} is not a two-letter language code`);
    }
  });

  it("can be repointed from the environment", () => {
    process.env.AI_SPEECH_LANGUAGES = "pa, ur";
    assert.deepEqual(speechLanguages(), ["pa", "ur"]);
  });

  it("normalises casing and whitespace in an override", () => {
    process.env.AI_SPEECH_LANGUAGES = "  UR , HI  ";
    assert.deepEqual(speechLanguages(), ["ur", "hi"]);
  });

  it("treats an empty override as a request for auto-detection", () => {
    /*
     * Distinct from unset, deliberately. Someone who writes
     * AI_SPEECH_LANGUAGES= wants the model to decide for itself, and quietly
     * restoring the default would leave no way to ask for that.
     */
    process.env.AI_SPEECH_LANGUAGES = "";
    assert.deepEqual(speechLanguages(), []);
  });

  it("names every language it can ask for", () => {
    // Providers with no `language` parameter are told in words instead, so a
    // code with no name would reach a model as a bare "ur".
    delete process.env.AI_SPEECH_LANGUAGES;
    for (const code of speechLanguages()) {
      assert.ok(SPEECH_LANGUAGE_NAMES[code], `${code} has no human-readable name`);
    }
  });
});
