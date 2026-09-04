import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { clip, summariseContents, type LoggedPart } from "@/services/gemini/log-redact";

/*
 * A transcript of every conversation CivicAI has with Gemini.
 *
 * Gemini is reached from five different services, and when a read comes back
 * wrong the first question is always the same: what did we actually send, and
 * what actually came back? Reconstructing that from application logs was
 * guesswork, because the prompts are long, assembled at run time, and never
 * printed anywhere.
 *
 * WHERE MOBILE FITS IN
 * The phone never talks to Gemini. It calls the same Next.js API routes the
 * browser does, and those routes call Gemini server-side — so logging here
 * captures both clients by construction. Which one made the call is recorded
 * as `source`, read from the request's user-agent where one is available.
 *
 * PRIVACY — read this before turning it on outside development.
 * The CNIC transcript contains a citizen's name, CNIC number, date of birth
 * and address in clear text, because that is exactly what the model was asked
 * to read and what it sent back. These files are therefore personal data. They
 * are written under logs/, which is gitignored, and they should be treated
 * like a database dump: not committed, not shared, and deleted when the
 * debugging is done. Set GEMINI_LOG=off to disable entirely.
 *
 * What is NEVER written, whatever the setting:
 *   - the API key
 *   - image, audio or any other binary payload (only its type and size)
 */

/** Off by explicit request; on otherwise, which is what makes it useful. */
function enabled(): boolean {
  return (process.env.GEMINI_LOG ?? "").toLowerCase() !== "off";
}

function logDir(): string {
  return process.env.GEMINI_LOG_DIR ?? join(process.cwd(), "logs", "gemini");
}

/**
 * Which client is behind this call.
 *
 * Read from the incoming request rather than passed down through five service
 * signatures. `next/headers` throws outside a request scope (a script, a test),
 * so a failure here is expected and simply means "unknown".
 */
async function callSource(): Promise<{ source: string; userAgent: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    const agent = list.get("user-agent");

    if (!agent) return { source: "unknown", userAgent: null };

    /*
     * React Native's fetch on Android goes out through OkHttp, and Expo Go
     * identifies itself too. Anything else reaching these routes is a browser.
     */
    const mobile = /okhttp|expo|react-?native|CivicAI-Mobile/i.test(agent);
    return { source: mobile ? "mobile" : "web", userAgent: agent };
  } catch {
    return { source: "unknown", userAgent: null };
  }
}

export { summariseContents };

export interface GeminiLogEntry {
  /** Which service made the call — "cnic-extract", "vision", and so on. */
  service: string;
  model: string;
  /** Milliseconds spent inside generateContent. */
  durationMs: number;
  request: {
    parts: LoggedPart[];
    config?: unknown;
  };
  /** The model's reply, verbatim. Absent when the call threw. */
  responseText?: string;
  error?: { name: string; message: string };
}

/**
 * Appends one entry to today's log.
 *
 * Never throws and never rejects: a logger that can break a citizen's
 * registration is worse than no logger at all. Failures are reported to the
 * console once and then swallowed.
 */
export async function logGeminiCall(entry: GeminiLogEntry): Promise<void> {
  if (!enabled()) return;

  try {
    const { source, userAgent } = await callSource();
    const now = new Date();

    const line = JSON.stringify({
      at: now.toISOString(),
      source,
      userAgent,
      service: entry.service,
      model: entry.model,
      durationMs: entry.durationMs,
      request: {
        parts: entry.request.parts,
        config: entry.request.config,
      },
      ...(entry.responseText === undefined
        ? {}
        : { responseText: clip(entry.responseText) }),
      ...(entry.error ? { error: entry.error } : {}),
    });

    const dir = logDir();
    await mkdir(dir, { recursive: true });

    // One file per day, JSON Lines: `tail -f` works, and so does jq.
    const file = join(dir, `gemini-${now.toISOString().slice(0, 10)}.log`);
    await appendFile(file, `${line}\n`, "utf8");
  } catch (error) {
    console.error(
      "[gemini-log] could not write the transcript:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
