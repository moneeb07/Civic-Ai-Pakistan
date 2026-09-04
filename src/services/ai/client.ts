import "server-only";

import OpenAI, { toFile } from "openai";

import { strictify } from "@/services/ai/json-schema";
import { logAiCall, summariseContents } from "@/services/ai/log";
import {
  modelsFor,
  speechLanguages,
  ttsFor,
  SPEECH_LANGUAGE_NAMES,
  type AiConfig,
  type AiTask,
  type ModelChoice,
} from "@/services/ai/model";

/*
 * The one door to whichever model provider is switched on.
 *
 * Every service used to build its own client and call the model directly. That
 * meant there was no single place a request could be observed, and no single
 * place to put the two things this file now exists for: FALLBACK, and the
 * PROVIDER SWITCH.
 *
 * On the provider switch — the app can be pointed at Gemini, OpenAI or
 * OpenRouter from one line of .env.local, because the five services that use
 * the model all come through here. They pass a task and a schema; which vendor
 * answers, at which URL, with which models, is decided in chains.ts and
 * applied here. That is deliberately NOT repeated in each service: five copies
 * of the same three-way branch would drift, and the moment they drift a
 * comparison between providers stops measuring the models and starts measuring
 * the inconsistencies between the branches.
 *
 * On fallback — a request is not one call. It is a walk down an ordered chain
 * of models until one answers usefully. That matters most on OpenRouter's free
 * tier, where a model being rate limited, busy or withdrawn is ordinary rather
 * than exceptional, but it earns its keep on the paid providers too. The
 * citizen photographing a pothole never learns that the first model was
 * unavailable.
 *
 * What counts as "usefully" is the caller's business, not this file's: a
 * service passes a `validate` predicate, and a reply that parses as JSON but
 * fails the service's own Zod schema is treated as a failed rung so the next
 * model is tried. On providers where strict schema enforcement is unavailable,
 * a loose reply is a normal outcome rather than a bug.
 *
 * All three providers speak the OpenAI wire format — Gemini via its
 * compatibility endpoint — so the official SDK is reused with a different
 * baseURL rather than hand-rolling three sets of fetch calls.
 */

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
/** One part of a multimodal user message — text or an image data URL. */
export type ChatContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export interface StructuredRequest {
  /** Which chain to walk. A vision request must not fall back to a text model. */
  task: "vision" | "text";
  messages: ChatMessage[];
  /** The shape wanted back. Enforced where the model supports it, asked for otherwise. */
  schema: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  /**
   * Returns false when a reply is unusable, which moves the request to the
   * next model. Services pass their own Zod parse here.
   */
  validate?: (text: string) => boolean;
}

export interface AiClient {
  /** Returns the model's JSON text, having walked the chain until one answered. */
  complete(request: StructuredRequest): Promise<string>;
  /**
   * Returns the spoken words as text, and the language the model was told to
   * expect — recorded rather than inferred, so nothing downstream has to guess
   * what a transcript is written in.
   */
  transcribe(input: {
    bytes: Buffer;
    mimeType: string;
    hint?: string;
  }): Promise<{ text: string; language: string | null }>;
  /**
   * Reads text aloud, returning the audio.
   *
   * Null — not an exception — when the active provider has no voice. The
   * caller's fallback is the browser's own synthesis, so "this provider
   * cannot" is an ordinary branch rather than a failure to report.
   */
  speak(input: {
    text: string;
    voice?: string;
  }): Promise<{ bytes: Buffer; mimeType: string } | null>;
}

/** The provider needs a format name, not a mime type. */
function audioFormatFor(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
  };
  return map[mimeType] ?? "wav";
}

/*
 * How the JSON shape is requested, per what the model actually supports.
 *
 * Sending `json_schema` to a model that does not implement it is not a soft
 * degradation — the provider rejects the whole request, so the rung fails for
 * a reason that has nothing to do with the photograph. Hence the per-model
 * capability recorded in chains.ts, which differs by provider.
 *
 * The schema is normalised on the way out, because strict mode also imposes
 * rules on the SCHEMA (see json-schema.ts) that the services' own schemas
 * predate. Without that, a valid key and a clear photograph still produce a
 * 400 — which is precisely the failure that is hardest to read, since nothing
 * about the message points at the schema.
 */
function responseFormatFor(choice: ModelChoice, schema: StructuredRequest["schema"]) {
  if (choice.json === "schema") {
    return {
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: schema.name,
          schema: strictify(schema.schema) as Record<string, unknown>,
          strict: true,
        },
      },
    };
  }
  if (choice.json === "object") {
    return { response_format: { type: "json_object" as const } };
  }
  return {};
}

/**
 * The schema, restated in words.
 *
 * Where a model cannot be held to a schema the shape has to be asked for, so
 * it is appended to the prompt — belt and braces with the Zod parse that runs
 * afterwards, rather than a replacement for it.
 */
function schemaInstruction(schema: StructuredRequest["schema"]): string {
  return (
    `\n\nReturn ONLY a JSON object matching this schema, with no prose, no ` +
    `markdown fence, and no commentary:\n${JSON.stringify(schema.schema)}`
  );
}

function withSchemaInPrompt(
  messages: ChatMessage[],
  schema: StructuredRequest["schema"],
): ChatMessage[] {
  const instruction = schemaInstruction(schema);

  // Appended to the FIRST user message so it travels with the task, rather
  // than being added as a trailing turn the model may weight differently.
  const index = messages.findIndex((message) => message.role === "user");
  if (index === -1) return messages;

  const target = messages[index];
  const content = target.content;

  const patched: ChatMessage =
    typeof content === "string"
      ? { ...target, content: content + instruction }
      : ({
          ...target,
          content: [
            ...(Array.isArray(content) ? content : []),
            { type: "text", text: instruction },
          ],
        } as ChatMessage);

  return messages.map((message, i) => (i === index ? patched : message));
}

/** Strips a ```json fence, which prompt-mode models add despite being asked not to. */
function unfence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

/**
 * Was this failure specifically about the LANGUAGE we asked for?
 *
 * Narrow on purpose. Treating every 400 as a language problem would retry a
 * corrupt recording once per language — billed calls that cannot succeed. The
 * check looks for a 400-class refusal that actually names the parameter, so
 * anything else propagates immediately and the model chain handles it.
 */
function isLanguageRejection(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status !== 400 && status !== 422) return false;

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("language");
}

/**
 * What a chat model is told, when there is no `language` parameter to set.
 *
 * Names the preferred language and its nearest neighbour, then says plainly
 * what NOT to do. The two failures worth naming are translating into English
 * — which silently destroys the citizen's own words — and transliterating
 * Urdu into Roman letters, which is the specific mangling that made spoken
 * Urdu come back looking like neither language.
 */
function transcriptionInstruction(languages: string[], hint?: string): string {
  const names = languages.map((code) => SPEECH_LANGUAGE_NAMES[code] ?? code);
  const expected =
    names.length === 0
      ? "the language actually spoken"
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;

  return (
    `Transcribe this recording word for word. The speaker is most likely ` +
    `speaking ${expected}. Write it in that language's own script — write Urdu ` +
    `in the Urdu script. Never translate into English, and never transliterate ` +
    `into Roman letters. If the speaker genuinely uses an English word, keep ` +
    `that word in English. Reply with the transcript alone and nothing else. ` +
    `If nothing intelligible was said, reply with an empty string.` +
    (hint ? `\n\nContext: ${hint}` : "")
  );
}

/**
 * Headers only OpenRouter wants.
 *
 * It attributes traffic by these and shows them on its public leaderboards.
 * Scoped to that provider rather than sent to all three: OpenAI and Google
 * have no use for them, and a header a vendor does not expect is a needless
 * variable in a comparison whose whole point is that only the model differs.
 */
function headersFor(config: Extract<AiConfig, { ok: true }>): Record<string, string> {
  if (config.provider !== "openrouter") return {};
  return {
    "HTTP-Referer": process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    "X-Title": "CivicAI Pakistan",
  };
}

/**
 * A client bound to one resolved provider.
 *
 * The config is passed in rather than read here, so each service decides what
 * to do about a missing key in its own vocabulary — the CNIC reader raises a
 * CnicExtractionError, the vision service a VisionAnalysisError — instead of
 * every one of them catching a generic throw from this constructor.
 */
export function aiClient(service: string, config: Extract<AiConfig, { ok: true }>): AiClient {
  const inner = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: headersFor(config),
  });

  async function walk<T>(task: AiTask, attempt: (choice: ModelChoice) => Promise<T>): Promise<T> {
    const chain = modelsFor(task, config.provider);
    let lastError: unknown;

    for (const choice of chain) {
      try {
        return await attempt(choice);
      } catch (error) {
        lastError = error;
        /*
         * Logged per rung and then swallowed, because a failed rung is a
         * normal event rather than an incident. Only the last one to fail
         * reaches the caller. The provider is named because "gemma did not
         * answer" is a very different problem from "every provider is down".
         */
        console.warn(
          `[ai:${service}] ${config.provider}/${choice.slug} did not answer:`,
          error instanceof Error ? error.message.slice(0, 160) : "unknown error",
        );
      }
    }

    throw lastError ?? new Error("No model in the chain returned a usable answer.");
  }

  return {
    async complete({ task, messages, schema, temperature = 0, validate }) {
      return walk(task, async (choice) => {
        const started = Date.now();

        /*
         * Summarised BEFORE the call. If the request throws, the prompt that
         * caused it is the single most useful thing to have on file, and
         * building the summary afterwards would risk losing it.
         */
        const outgoing =
          choice.json === "schema" ? messages : withSchemaInPrompt(messages, schema);
        const parts = summariseContents(outgoing);

        // Recorded on every line, so a transcript spanning a provider switch
        // can still be read back apart — which is the point of switching.
        const logConfig = {
          provider: config.provider,
          temperature,
          json: choice.json,
          schema: schema.name,
        };

        try {
          const response = await inner.chat.completions.create({
            model: choice.slug,
            messages: outgoing,
            temperature,
            ...responseFormatFor(choice, schema),
          });

          const raw = response.choices[0]?.message?.content ?? "";
          const text = unfence(raw);

          /*
           * Awaited, not fired and forgotten. The logger reads the incoming
           * request's headers to record whether the call came from the phone
           * or the browser, and that scope is gone the moment this returns.
           */
          await logAiCall({
            service,
            model: choice.slug,
            durationMs: Date.now() - started,
            request: { parts, config: logConfig },
            responseText: text,
          });

          if (!text) throw new Error("empty response");

          /*
           * A reply that parses but does not fit is a failed rung, not a
           * failed request — where nothing enforces a schema, the next model
           * is a better answer than an error.
           */
          if (validate && !validate(text)) {
            throw new Error("response did not match the expected shape");
          }

          return text;
        } catch (error) {
          await logAiCall({
            service,
            model: choice.slug,
            durationMs: Date.now() - started,
            request: { parts, config: logConfig },
            error: {
              name: error instanceof Error ? error.name : "unknown",
              message: error instanceof Error ? error.message : String(error),
            },
          });
          throw error;
        }
      });
    },

    async transcribe({ bytes, mimeType, hint }) {
      const languages = speechLanguages();

      return walk("audio", async (choice) => {
        const format = audioFormatFor(mimeType);
        const logged = [{ kind: "binary" as const, mimeType, bytes: bytes.byteLength }];

        const record = async (
          language: string | null,
          durationMs: number,
          result: { responseText: string } | { error: unknown },
        ) => {
          const error = "error" in result ? result.error : undefined;
          await logAiCall({
            service,
            model: choice.slug,
            durationMs,
            request: {
              parts: logged,
              config: {
                provider: config.provider,
                modality: "audio",
                format,
                transport: choice.audio ?? "chat",
                language,
              },
            },
            ...("responseText" in result ? { responseText: result.responseText } : {}),
            ...(error
              ? {
                  error: {
                    name: error instanceof Error ? error.name : "unknown",
                    message: error instanceof Error ? error.message : String(error),
                  },
                }
              : {}),
          });
        };

        if (choice.audio === "transcriptions") {
          const file = await toFile(bytes, `speech.${format}`, { type: mimeType });

          /*
           * The language chain is walked INSIDE one model's attempt, because a
           * provider that will not accept "ur" will not accept it from any of
           * its models either — retrying per model would spend real money
           * rediscovering the same refusal. The trailing null is auto-detect:
           * a worse transcript is still better than no transcript.
           */
          let lastError: unknown;

          for (const language of [...languages, null]) {
            const attemptStarted = Date.now();
            try {
              /*
               * `prompt` is a STYLE and VOCABULARY hint, not an instruction
               * channel — the model does not follow directions given this way
               * the way a chat model would. `language` is the part that
               * actually decides how the audio is decoded.
               */
              const response = await inner.audio.transcriptions.create({
                model: choice.slug,
                file,
                ...(language ? { language } : {}),
                ...(hint ? { prompt: hint } : {}),
              });

              const text = (response.text ?? "").trim();
              await record(language, Date.now() - attemptStarted, { responseText: text });
              return { text, language };
            } catch (error) {
              lastError = error;
              await record(language, Date.now() - attemptStarted, { error });

              /*
               * Only an unsupported LANGUAGE is worth trying the next one for.
               * A bad key, a rate limit or a corrupt recording will fail
               * identically in every language, so retrying would be three
               * billed calls to learn what the first one already said.
               */
              if (!isLanguageRejection(error)) throw error;
            }
          }

          throw lastError ?? new Error("no transcription language was accepted");
        }

        /*
         * Gemini and OpenRouter expose no transcription endpoint, so audio
         * rides in as a chat content part — and here the language preference
         * is a real instruction rather than a parameter, which is why the
         * wording differs from the branch above rather than being shared.
         */
        const language = languages[0] ?? null;
        const attemptStarted = Date.now();

        try {
          const response = await inner.chat.completions.create({
            model: choice.slug,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: transcriptionInstruction(languages, hint) },
                  {
                    type: "input_audio",
                    input_audio: { data: bytes.toString("base64"), format },
                  },
                ],
              } as ChatMessage,
            ],
          });

          const text = unfence(response.choices[0]?.message?.content ?? "");
          await record(language, Date.now() - attemptStarted, { responseText: text });
          return { text, language };
        } catch (error) {
          await record(language, Date.now() - attemptStarted, { error });
          throw error;
        }
      });
    },

    async speak({ text, voice }) {
      const tts = ttsFor(config.provider);
      if (!tts) return null;

      const started = Date.now();
      const logged = [{ kind: "text" as const, text }];
      const logConfig = { provider: config.provider, modality: "tts", voice: voice ?? tts.voice };

      try {
        const response = await inner.audio.speech.create({
          model: tts.slug,
          voice: voice ?? tts.voice,
          input: text,
          /*
           * mp3 rather than the default: it is the one format every browser
           * plays from a blob URL without a codec question, and this audio
           * exists to be played immediately rather than stored.
           */
          response_format: "mp3",
        });

        const bytes = Buffer.from(await response.arrayBuffer());

        await logAiCall({
          service,
          model: tts.slug,
          durationMs: Date.now() - started,
          request: { parts: logged, config: logConfig },
          // The spoken text is already logged as the request; recording the
          // audio would only add megabytes of base64 to a debugging file.
          responseText: `${bytes.byteLength} bytes of audio`,
        });

        return { bytes, mimeType: "audio/mpeg" };
      } catch (error) {
        await logAiCall({
          service,
          model: tts.slug,
          durationMs: Date.now() - started,
          request: { parts: logged, config: logConfig },
          error: {
            name: error instanceof Error ? error.name : "unknown",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
  };
}
