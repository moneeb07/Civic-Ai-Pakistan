/*
 * WHICH PROVIDER CivicAI talks to, and which models it walks within it.
 *
 * The app supports three providers — Gemini, OpenAI and OpenRouter — chosen by
 * a single environment variable. The point is not redundancy for its own sake:
 * it is that the same civic pipeline can be run against all three and COMPARED,
 * on the same photographs and the same CNICs, for accuracy and for speed. A
 * claim like "Gemini reads Urdu CNIC backs better than GPT does" is only worth
 * making if switching between them is one line in .env.local rather than a
 * branch in the code.
 *
 *   AI_PROVIDER=gemini | openai | openrouter
 *
 * Left unset, the first provider with a key present wins, so an existing
 * .env.local keeps working untouched.
 *
 * WHY ONE CLIENT SERVES ALL THREE
 * All three speak the OpenAI wire format — OpenRouter natively, and Gemini
 * through its OpenAI-compatibility endpoint. So the difference between
 * providers collapses to the three things this file records: a base URL, a
 * key, and a list of models. There is no per-provider SDK and no per-provider
 * branch inside the services, which is exactly what makes the comparison fair:
 * the prompts, the schemas and the validation are identical across all three,
 * so a difference in the output is a difference in the MODEL.
 *
 * Deliberately free of "server-only", so scripts and tests can read the
 * configuration — `npm run check:ai` walks these very chains to report which
 * rungs are alive. The same split as env-schema.ts beside env.ts. Nothing here
 * is secret: model slugs and base URLs are public, and keys are read from the
 * environment at the point of use rather than stored in this file.
 *
 * MODALITY IS NOT NEGOTIABLE. Every model in a vision chain must accept
 * images, and every model in an audio chain must accept audio — a text-only
 * model cannot stand in for either, it just fails differently.
 */

export type AiProvider = "gemini" | "openai" | "openrouter";
export type AiTask = "vision" | "text" | "audio";

/** How strictly a model can be held to a JSON shape. Checked, not guessed. */
export type JsonMode = "schema" | "object" | "prompt";

/**
 * How audio reaches the model, which genuinely differs between providers.
 *
 * "chat"           — the recording rides in as a content part of a chat
 *                    message. Gemini and OpenRouter both work this way, and
 *                    it is the only option either of them offers.
 * "transcriptions" — a dedicated /audio/transcriptions endpoint. OpenAI has
 *                    one, and it is markedly better and cheaper at this job
 *                    than handing a recording to a chat model.
 */
export type AudioTransport = "chat" | "transcriptions";

export interface ModelChoice {
  slug: string;
  /**
   * "schema" — enforces a JSON Schema (structured outputs)
   * "object" — guarantees valid JSON, but not the shape
   * "prompt" — neither; the shape is asked for in words and verified after
   */
  json: JsonMode;
  /** Audio chains only. Ignored for vision and text. */
  audio?: AudioTransport;
}

export interface ProviderDefinition {
  /** For log lines and error messages a human has to read. */
  label: string;
  /** The environment variable holding this provider's key. */
  keyEnv: string;
  /** Optional override, for a proxy or a regional endpoint. */
  baseUrlEnv: string;
  baseUrl: string;
  chains: Record<AiTask, ModelChoice[]>;
  /**
   * Text-to-speech, where the provider has it.
   *
   * Optional because only one of the three does. This is not a chain: there is
   * nothing to fall back to within a provider, and the real fallback is a
   * different mechanism entirely — the browser's own speech synthesis, which
   * lives in the client and needs no key. Absent here means "ask the browser".
   */
  tts?: { slug: string; voice: string };
}

/*
 * OPENROUTER — the free tier, and the default.
 *
 * Free capacity is exactly the thing that disappears without warning: a model
 * gets rate limited, deprecated, or is simply busy. So no task here depends on
 * a single model, and the chains are ordered best-fit first rather than
 * cheapest first — they are all free, so the only currency is quality and the
 * odds of getting an answer at all.
 *
 * No free vision model supports strict schemas today, hence "object" through
 * that whole chain: valid JSON is guaranteed, and the SHAPE is enforced
 * afterwards by the Zod parse each service already runs.
 */
const OPENROUTER: ProviderDefinition = {
  label: "OpenRouter (free tier)",
  keyEnv: "OPENROUTER_API_KEY",
  baseUrlEnv: "OPENROUTER_BASE_URL",
  baseUrl: "https://openrouter.ai/api/v1",
  chains: {
    vision: [
      // Dense 31B, 262K context — the strongest free vision model on the list.
      { slug: "google/gemma-4-31b-it:free", json: "object" },
      // 1M context multimodal; a different vendor, so unlikely to fail in the
      // same way or at the same moment as the Gemma models above and below.
      { slug: "minimax/minimax-m3:free", json: "object" },
      // Sparse MoE, ~3.8B active — fastest of the three, kept last as the
      // "something rather than nothing" rung.
      { slug: "google/gemma-4-26b-a4b-it:free", json: "object" },
    ],
    text: [
      // The two free models that genuinely enforce a schema lead here, because
      // this is the one task where they are available.
      { slug: "z-ai/glm-5.2:free", json: "schema" },
      { slug: "nvidia/nemotron-3-super-120b-a12b:free", json: "schema" },
      { slug: "minimax/minimax-m2.7:free", json: "object" },
    ],
    /*
     * Exactly ONE free model on OpenRouter accepts audio input, so this chain
     * cannot have a second rung — and it supports neither response_format nor
     * structured outputs, hence "prompt". This is the least certain path in
     * the app, and deliberately the one with a real product fallback behind
     * it: when transcription is unavailable the describe step asks the citizen
     * to type instead, which is a first-class path rather than an error.
     */
    audio: [
      { slug: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", json: "prompt", audio: "chat" },
    ],
  },
};

/*
 * OPENAI — the paid baseline, and the accuracy yardstick.
 *
 * gpt-4o leads every chain, on a paid key and by explicit choice: it is the
 * strongest of these at the job that actually matters here, reading a scuffed
 * CNIC held at an angle under bad light. Measured against the same synthetic
 * card, it returned a usable read in 3.4s where Gemini took 88s and OpenRouter
 * 74s and neither could read the card at all — a difference large enough to
 * decide the ordering on its own.
 *
 * gpt-4o-mini sits behind it as the cheaper rung that answers if gpt-4o is
 * unavailable. Being second costs nothing in the ordinary case: the chain is
 * walked in order and stops at the first useful answer, so a fallback rung is
 * only ever billed when the one above it has already failed.
 *
 * The newer gpt-5 line is deliberately NOT the default here, and the reason is
 * mechanical rather than a judgment about quality: its reasoning models reject
 * a `temperature` other than the default, which this client sends on every
 * request. Overriding AI_MODELS_* to a gpt-5 model will therefore fail until
 * that is handled — unlike the 4o line, which was left as the default because
 * it is known to work with the code as written.
 *
 * Audio is the one place a provider's shape genuinely differs: OpenAI has a
 * purpose-built transcription endpoint, so the chain uses it instead of
 * passing a recording to a chat model.
 */
const OPENAI: ProviderDefinition = {
  label: "OpenAI",
  keyEnv: "OPENAI_API_KEY",
  baseUrlEnv: "OPENAI_BASE_URL",
  baseUrl: "https://api.openai.com/v1",
  chains: {
    vision: [
      { slug: "gpt-4o", json: "schema" },
      { slug: "gpt-4o-mini", json: "schema" },
    ],
    text: [
      { slug: "gpt-4o", json: "schema" },
      { slug: "gpt-4o-mini", json: "schema" },
    ],
    audio: [
      { slug: "gpt-4o-transcribe", json: "prompt", audio: "transcriptions" },
      // whisper-1 rather than the mini transcriber: older, cheaper, and still
      // the most forgiving of poor phone microphones and heavy code-switching.
      // A genuinely different model is a better fallback than a smaller copy
      // of the first — and it is the one slug here certain to exist, so an
      // unavailable rung above it degrades instead of taking voice down.
      { slug: "whisper-1", json: "prompt", audio: "transcriptions" },
    ],
  },
  /*
   * Why this exists at all: the browser cannot be relied on to speak Urdu.
   * A desktop Chrome on Linux typically ships NO Urdu and no Hindi voice, and
   * speechSynthesis in that state does not fail — it reports that it is
   * speaking and produces silence, which is the worst possible outcome for a
   * citizen who cannot read the screen. Generating the audio server-side makes
   * the voice a property of the app rather than of whatever the device happens
   * to have installed.
   */
  tts: { slug: "gpt-4o-mini-tts", voice: "alloy" },
};

/*
 * GEMINI — reached through its OpenAI-compatibility endpoint.
 *
 * Google exposes /v1beta/openai/, which speaks chat completions, accepts image
 * and audio content parts, and honours response_format. That is what lets this
 * provider share one client with the other two rather than pulling in the
 * Google SDK and a second code path through every service.
 *
 * Every slug and capability below was checked against the live catalogue
 * rather than assumed, and that mattered: the 2.5 line this was first written
 * against now answers 404 — "no longer available to new users" — so a plausible
 * guess would have shipped a provider that could never answer. Worth
 * re-running `npm run check:ai -- --all` before trusting these again.
 */
const GEMINI: ProviderDefinition = {
  label: "Google Gemini",
  keyEnv: "GEMINI_API_KEY",
  baseUrlEnv: "GEMINI_BASE_URL",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  chains: {
    // Both verified to accept an image AND a strict schema in one request
    // through the compatibility layer — the combination worth confirming,
    // since a rejection there would look like a bad photograph.
    vision: [
      { slug: "gemini-3.8-flash", json: "schema" },
      { slug: "gemini-3.7-flash", json: "schema" },
    ],
    text: [
      { slug: "gemini-3.8-flash", json: "schema" },
      { slug: "gemini-3.7-flash", json: "schema" },
    ],
    /*
     * Gemini exposes no /audio/transcriptions (it answers 404), so a recording
     * goes in as a chat content part. A purpose-built transcription model
     * leads, with a general flash model behind it — a genuinely different
     * approach as the fallback rather than a second copy of the first.
     */
    audio: [
      { slug: "gemini-3.5-transcribe", json: "prompt", audio: "chat" },
      { slug: "gemini-3.8-flash", json: "prompt", audio: "chat" },
    ],
  },
};

const PROVIDERS: Record<AiProvider, ProviderDefinition> = {
  openrouter: OPENROUTER,
  openai: OPENAI,
  gemini: GEMINI,
};

export const AI_PROVIDERS = Object.keys(PROVIDERS) as AiProvider[];

/**
 * Which provider is used when AI_PROVIDER is not set: first key present wins.
 *
 * OpenRouter leads because it is what the app was last configured for, so an
 * untouched .env.local keeps behaving exactly as it did before any of this
 * became switchable.
 */
const AUTO_ORDER: AiProvider[] = ["openrouter", "openai", "gemini"];

function isProvider(value: string): value is AiProvider {
  return value in PROVIDERS;
}

/** A provider's static facts: label, key name, endpoint, chains. No secrets. */
export function providerDefinition(provider: AiProvider): ProviderDefinition {
  return PROVIDERS[provider];
}

/**
 * The resolved provider and everything needed to reach it.
 *
 * A result rather than an exception, because both failure modes — no key, or
 * AI_PROVIDER misspelled — are configuration mistakes that every service
 * already has a "not configured" path for. Throwing here would turn a precise
 * message into a 500 several frames away from its cause.
 */
export type AiConfig =
  | { ok: true; provider: AiProvider; label: string; apiKey: string; baseUrl: string }
  | { ok: false; reason: string };

export function aiConfig(): AiConfig {
  const named = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (named && !isProvider(named)) {
    /*
     * Never quietly fall through to a different provider. Someone comparing
     * accuracy across three of them has to be able to trust that the numbers
     * came from the one they named — silently substituting another model
     * would corrupt the very comparison this file exists to make possible.
     */
    return {
      ok: false,
      reason:
        `AI_PROVIDER is set to "${named}", which is not a provider. ` +
        `Use one of: ${AI_PROVIDERS.join(", ")}.`,
    };
  }

  const provider =
    (named as AiProvider) ||
    AUTO_ORDER.find((candidate) => Boolean(process.env[PROVIDERS[candidate].keyEnv]?.trim())) ||
    "openrouter";

  const definition = PROVIDERS[provider];
  const apiKey = process.env[definition.keyEnv]?.trim();

  if (!apiKey) {
    return {
      ok: false,
      reason:
        `${definition.keyEnv} is not set, but AI_PROVIDER selects ${definition.label}. ` +
        `Add the key to .env.local, or point AI_PROVIDER at a provider you have a key for.`,
    };
  }

  return {
    ok: true,
    provider,
    label: definition.label,
    apiKey,
    baseUrl: process.env[definition.baseUrlEnv]?.trim() || definition.baseUrl,
  };
}

/**
 * The active provider's text-to-speech, or null when it has none.
 *
 * Null is a normal answer, not a failure: the caller falls back to the
 * browser's own synthesis, which needs no key and no network.
 */
export function ttsFor(provider: AiProvider): { slug: string; voice: string } | null {
  return PROVIDERS[provider].tts ?? null;
}

/** True when the active provider can actually be called. */
export function isAiConfigured(): boolean {
  return aiConfig().ok;
}

/**
 * The ordered models to try for a task, on a given provider.
 *
 * An override lets a chain be repointed without a deploy, from the same
 * .env.local the key lives in — the escape hatch for the day a model is
 * withdrawn mid-demo. It applies to whichever provider is active, so it is
 * written in that provider's own slugs:
 *
 *   AI_MODELS_VISION="gpt-4o,gpt-4o-mini"
 *
 * Overridden models are assumed "object", the safe middle: asking for JSON
 * without claiming a schema the model may not honour. An overridden audio
 * chain keeps the provider's own transport, since how a recording reaches the
 * model is a property of the provider, not of the model slug.
 */
/**
 * Which language the speech models are told to expect, in order of preference.
 *
 * WHY THIS IS NOT LEFT TO AUTO-DETECT. Given no language, a transcription
 * model guesses from the first seconds of audio — and on a phone recording of
 * Urdu, in a street, mid-sentence, it very often guesses wrong and produces
 * something that is neither Urdu nor English but a mangled approximation of
 * both. Naming the language removes the guess.
 *
 * Urdu leads because that is what CivicAI's users actually speak. Hindi sits
 * behind it for one specific reason: spoken Hindi and Urdu are close to the
 * same language, so a Hindi model handed Urdu speech produces a far better
 * result than a model that has fallen back to English — it is the nearest
 * usable neighbour, not an arbitrary second choice.
 *
 * Both are ISO-639-1 codes, which is what the transcription endpoint expects.
 * Override for testing, or if a provider names them differently:
 *
 *   AI_SPEECH_LANGUAGES="ur,hi"
 *
 * Set it empty to restore auto-detection.
 */
const SPEECH_LANGUAGES = ["ur", "hi"];

export function speechLanguages(): string[] {
  const override = process.env.AI_SPEECH_LANGUAGES;
  if (override === undefined) return SPEECH_LANGUAGES;

  return override
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
}

/** The language names, for providers that take an instruction rather than a code. */
export const SPEECH_LANGUAGE_NAMES: Record<string, string> = {
  ur: "Urdu",
  hi: "Hindi",
  en: "English",
  pa: "Punjabi",
  ps: "Pashto",
  sd: "Sindhi",
};

export function modelsFor(task: AiTask, provider: AiProvider = "openrouter"): ModelChoice[] {
  const chain = PROVIDERS[provider].chains[task];
  const override = process.env[`AI_MODELS_${task.toUpperCase()}`];
  if (!override) return chain;

  const slugs = override
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  if (slugs.length === 0) return chain;

  const transport = chain[0]?.audio ?? "chat";
  return slugs.map((slug) => ({
    slug,
    json: "object" as const,
    ...(task === "audio" ? { audio: transport } : {}),
  }));
}
