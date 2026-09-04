import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  aiConfig,
  isAiConfigured,
  modelsFor,
  providerDefinition,
  AI_PROVIDERS,
  type AiProvider,
} from "../src/services/ai/chains";

/*
 * Two things are worth pinning here, and they are not the same thing.
 *
 * THE CHAINS — what stands between a busy model and a dead demo. The
 * properties are structural: every rung of a multimodal chain must actually
 * accept that modality, and no chain may silently acquire a text-only fallback
 * that would fail in a confusing way rather than an honest one.
 *
 * THE PROVIDER SWITCH — the app can be pointed at Gemini, OpenAI or OpenRouter
 * to compare their accuracy on the same inputs. That comparison is only worth
 * anything if the switch is exact: naming a provider must select THAT provider
 * or fail loudly, never quietly answer from a different one. A silent
 * substitution would not break the app, which is precisely what makes it
 * dangerous — the numbers would simply be wrong, and nothing would say so.
 *
 * Tested against chains.ts rather than model.ts because the latter imports
 * "server-only", which throws outside a Next.js bundle — the same split
 * gov-env.test.ts uses for env-schema.ts.
 */

/** Every environment variable these tests touch, restored after each one. */
const TOUCHED = [
  "AI_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "AI_MODELS_VISION",
  "AI_MODELS_TEXT",
  "AI_MODELS_AUDIO",
];

const SAVED = new Map(TOUCHED.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of SAVED) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Clears the lot, so a test states its own world rather than inheriting one. */
function withEnv(vars: Record<string, string>) {
  for (const key of TOUCHED) delete process.env[key];
  Object.assign(process.env, vars);
}

/** Models that accept image input, per provider. Checked, not assumed. */
const VISION_CAPABLE: Record<AiProvider, Set<string>> = {
  openrouter: new Set([
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "minimax/minimax-m3:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ]),
  openai: new Set(["gpt-4o-mini", "gpt-4o"]),
  gemini: new Set(["gemini-3.8-flash", "gemini-3.7-flash"]),
};

/** Models that accept audio input, per provider. */
const AUDIO_CAPABLE: Record<AiProvider, Set<string>> = {
  openrouter: new Set(["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"]),
  openai: new Set(["gpt-4o-transcribe", "whisper-1"]),
  gemini: new Set(["gemini-3.5-transcribe", "gemini-3.8-flash"]),
};

/** Models that genuinely enforce a JSON Schema. */
const STRICT_CAPABLE = new Set([
  "z-ai/glm-5.2:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "gpt-4o-mini",
  "gpt-4o",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
]);

const TASKS = ["vision", "text", "audio"] as const;

describe("model chains", () => {
  it("gives every provider a model for every task", () => {
    for (const provider of AI_PROVIDERS) {
      for (const task of TASKS) {
        assert.ok(
          modelsFor(task, provider).length > 0,
          `${provider} has no model for ${task}`,
        );
      }
    }
  });

  it("only puts image-capable models in a vision chain", () => {
    // A text-only model here would not degrade — it would fail on every photo.
    for (const provider of AI_PROVIDERS) {
      for (const choice of modelsFor("vision", provider)) {
        assert.ok(
          VISION_CAPABLE[provider].has(choice.slug),
          `${provider}/${choice.slug} cannot accept images but sits in the vision chain`,
        );
      }
    }
  });

  it("only puts audio-capable models in an audio chain", () => {
    for (const provider of AI_PROVIDERS) {
      for (const choice of modelsFor("audio", provider)) {
        assert.ok(
          AUDIO_CAPABLE[provider].has(choice.slug),
          `${provider}/${choice.slug} cannot accept audio but sits in the audio chain`,
        );
      }
    }
  });

  it("declares how audio reaches every audio model", () => {
    /*
     * The client picks between the transcription endpoint and a chat content
     * part from this field. Leaving it off does not fail loudly — it quietly
     * sends a recording down the wrong path for that provider.
     */
    for (const provider of AI_PROVIDERS) {
      for (const choice of modelsFor("audio", provider)) {
        assert.ok(
          choice.audio === "chat" || choice.audio === "transcriptions",
          `${provider}/${choice.slug} does not say how audio reaches it`,
        );
      }
    }
  });

  it("declares a json mode for every model", () => {
    // The client picks response_format from this; an unknown value would
    // silently send a schema to a model that rejects the whole request.
    for (const provider of AI_PROVIDERS) {
      for (const task of TASKS) {
        for (const choice of modelsFor(task, provider)) {
          assert.ok(
            ["schema", "object", "prompt"].includes(choice.json),
            `${provider}/${choice.slug} has an unusable json mode: ${choice.json}`,
          );
        }
      }
    }
  });

  it("never claims strict schema support for a model that lacks it", () => {
    /*
     * Claiming structured outputs where they are unsupported does not degrade
     * gracefully — the provider rejects the request outright, so the rung
     * fails for a reason unrelated to the input.
     */
    for (const provider of AI_PROVIDERS) {
      for (const task of TASKS) {
        for (const choice of modelsFor(task, provider)) {
          if (choice.json === "schema") {
            assert.ok(
              STRICT_CAPABLE.has(choice.slug),
              `${provider}/${choice.slug} cannot enforce a schema`,
            );
          }
        }
      }
    }
  });

  it("gives vision and text a real fallback on every provider", () => {
    for (const provider of AI_PROVIDERS) {
      assert.ok(modelsFor("vision", provider).length >= 2, `${provider} vision has no fallback`);
      assert.ok(modelsFor("text", provider).length >= 2, `${provider} text has no fallback`);
    }
  });

  it("lets a chain be repointed from the environment", () => {
    withEnv({ AI_MODELS_TEXT: "a/model, b/model" });
    const chain = modelsFor("text", "openai");
    assert.deepEqual(chain.map((c) => c.slug), ["a/model", "b/model"]);
    // Overrides claim only "object" — never a schema the model may not honour.
    assert.ok(chain.every((c) => c.json === "object"));
  });

  it("keeps the provider's audio transport when the audio chain is overridden", () => {
    /*
     * How a recording reaches a model is a property of the PROVIDER, not of
     * the slug. Dropping the transport on override would send OpenAI's audio
     * to a chat endpoint that does not want it.
     */
    withEnv({ AI_MODELS_AUDIO: "some-transcriber" });
    assert.equal(modelsFor("audio", "openai")[0].audio, "transcriptions");
    assert.equal(modelsFor("audio", "gemini")[0].audio, "chat");
  });

  it("ignores an override that is only whitespace", () => {
    withEnv({ AI_MODELS_VISION: "  , ," });
    // Falling back to the defaults beats leaving a task with no models at all.
    assert.ok(modelsFor("vision", "openai").length > 0);
  });
});

describe("provider selection", () => {
  it("uses the provider named in AI_PROVIDER", () => {
    withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    const config = aiConfig();
    assert.ok(config.ok);
    assert.equal(config.provider, "gemini");
    assert.ok(config.baseUrl.includes("generativelanguage.googleapis.com"));
  });

  it("refuses to answer from a different provider than the one named", () => {
    /*
     * The whole point of the switch is that a measurement can be attributed.
     * With OpenAI's key present and Gemini named, falling back to OpenAI would
     * produce perfectly good output credited to the wrong model.
     */
    withEnv({ AI_PROVIDER: "gemini", OPENAI_API_KEY: "k" });
    const config = aiConfig();
    assert.equal(config.ok, false);
    assert.ok(!config.ok && config.reason.includes("GEMINI_API_KEY"));
  });

  it("rejects a misspelled provider rather than guessing", () => {
    withEnv({ AI_PROVIDER: "openrouterr", OPENROUTER_API_KEY: "k" });
    const config = aiConfig();
    assert.equal(config.ok, false);
    assert.ok(!config.ok && config.reason.includes("not a provider"));
  });

  it("is case and whitespace tolerant about the provider name", () => {
    withEnv({ AI_PROVIDER: "  OpenAI  ", OPENAI_API_KEY: "k" });
    const config = aiConfig();
    assert.ok(config.ok);
    assert.equal(config.provider, "openai");
  });

  it("falls back to whichever provider has a key when none is named", () => {
    withEnv({ OPENAI_API_KEY: "k" });
    const config = aiConfig();
    assert.ok(config.ok);
    assert.equal(config.provider, "openai");
  });

  it("reports itself unconfigured when no key is present anywhere", () => {
    withEnv({});
    assert.equal(isAiConfigured(), false);
    const config = aiConfig();
    assert.ok(!config.ok && config.reason.includes("OPENROUTER_API_KEY"));
  });

  it("treats a blank key as no key", () => {
    // An empty assignment in .env.local is how a key most often goes missing,
    // and it would otherwise pass a truthiness check on the variable's name.
    withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "   " });
    assert.equal(isAiConfigured(), false);
  });

  it("lets the endpoint be repointed per provider", () => {
    withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_BASE_URL: "http://localhost:9/v1" });
    const config = aiConfig();
    assert.ok(config.ok);
    assert.equal(config.baseUrl, "http://localhost:9/v1");
    delete process.env.OPENAI_BASE_URL;
  });

  it("names a distinct key variable for each provider", () => {
    // Two providers sharing a key variable would make them impossible to
    // configure independently, which is the one thing this must support.
    const keys = AI_PROVIDERS.map((provider) => providerDefinition(provider).keyEnv);
    assert.equal(new Set(keys).size, keys.length);
  });
});
