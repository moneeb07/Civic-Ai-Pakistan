import "server-only";

import { GoogleGenAI } from "@google/genai";

import { logGeminiCall, summariseContents } from "@/services/gemini/log";

/*
 * The one door to Gemini.
 *
 * Every service used to build its own `new GoogleGenAI({ apiKey })` and call
 * `models.generateContent` directly. That worked, but it meant there was no
 * single place where a request could be observed — so adding a transcript
 * would have meant five copies of the same logging code, and the sixth service
 * written next month would quietly have none.
 *
 * This wrapper keeps the SDK's exact shape (`client.models.generateContent`),
 * so a call site changes by one line and nothing else. What it adds is that
 * every request and every reply passes through the logger on the way.
 *
 * The API key is still read and checked by each service, which owns the typed
 * "not configured" error its callers expect; it is passed in here rather than
 * re-read, so this file has one job.
 */

type GenerateContentParameters = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenerateContentResponse = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

export interface GeminiClient {
  models: {
    generateContent: (params: GenerateContentParameters) => Promise<GenerateContentResponse>;
  };
}

/**
 * A Gemini client that writes a transcript of everything it sends and receives.
 *
 * @param service Short name for the caller — "cnic-extract", "vision", … —
 *                which is what makes a log file readable when five services
 *                are interleaved in it.
 */
export function geminiClient(service: string, apiKey: string): GeminiClient {
  const inner = new GoogleGenAI({ apiKey });

  return {
    models: {
      generateContent: async (params) => {
        const started = Date.now();

        /*
         * Summarised BEFORE the call. If the request throws, the prompt that
         * caused it is the single most useful thing to have on file, and
         * building the summary afterwards would risk losing it.
         */
        const parts = summariseContents(params.contents);

        try {
          const response = await inner.models.generateContent(params);

          /*
           * Awaited, not fired and forgotten. The logger reads the incoming
           * request's headers to record whether the call came from the phone
           * or the browser, and that scope is gone the moment this returns.
           */
          await logGeminiCall({
            service,
            model: params.model,
            durationMs: Date.now() - started,
            request: { parts, config: params.config },
            responseText: response.text,
          });

          return response;
        } catch (error) {
          await logGeminiCall({
            service,
            model: params.model,
            durationMs: Date.now() - started,
            request: { parts, config: params.config },
            error: {
              name: error instanceof Error ? error.name : "unknown",
              message: error instanceof Error ? error.message : String(error),
            },
          });

          // Rethrown untouched: each service maps this to its own typed error.
          throw error;
        }
      },
    },
  };
}
