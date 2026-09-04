// MUST be first: everything below reads the providers' keys as it is constructed.
import "./load-env.mts";

import {
  aiConfig,
  modelsFor,
  providerDefinition,
  AI_PROVIDERS,
  type AiProvider,
  type AiTask,
  type ModelChoice,
} from "../src/services/ai/chains";

/*
 * Does the AI actually work right now — and on which provider?
 *
 * Walks each task's model chain and reports, per model, whether it answered.
 * The point is to find out BEFORE a demo which rungs are alive: capacity moves
 * around, and "the second model is carrying us today" is worth knowing in
 * advance rather than discovering on stage.
 *
 *   npm run check:ai           the provider the app is actually configured for
 *   npm run check:ai -- --all  every provider a key is present for
 *
 * The --all form is what makes the three-provider setup useful rather than
 * merely possible: it is the side-by-side that says which one is up, and how
 * fast, before any judgment about which reads a CNIC better.
 */

const args = process.argv.slice(2);
const ALL = args.includes("--all") || args.includes("-a");

const PROBES: Record<AiTask, string> = {
  text: 'Reply with exactly: {"ok":true}',
  vision: 'Reply with exactly: {"ok":true}',
  audio: "Reply with the single word: ready",
};

/**
 * Half a second of silence, as a 16-bit mono WAV.
 *
 * Needed because a transcription ENDPOINT cannot be probed with a text prompt
 * the way a chat model can — posting one to /audio/transcriptions fails for
 * reasons that say nothing about whether the model is reachable. Silence is
 * the smallest honest input: a healthy endpoint accepts it and returns an
 * empty or near-empty transcript, which is a pass.
 */
function silentWav(): Buffer {
  const sampleRate = 16_000;
  const samples = sampleRate / 2;
  const data = Buffer.alloc(samples * 2); // zeroes — silence
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/** Trailing slash matters: Gemini's compatibility base URL carries one. */
function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function headersFor(provider: AiProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    headers["X-Title"] = "CivicAI Pakistan";
  }
  return headers;
}

async function probeChat(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
  slug: string,
  prompt: string,
): Promise<string> {
  const started = Date.now();

  const response = await fetch(endpoint(baseUrl, "chat/completions"), {
    method: "POST",
    headers: { ...headersFor(provider, apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: slug,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 32,
    }),
  });

  const ms = Date.now() - started;

  if (!response.ok) {
    return `FAIL ${response.status} (${ms}ms) ${(await response.text()).slice(0, 90)}`;
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return `OK   (${ms}ms) ${JSON.stringify(text.slice(0, 40))}`;
}

async function probeTranscription(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
  slug: string,
): Promise<string> {
  const started = Date.now();

  const form = new FormData();
  form.append("model", slug);
  form.append("file", new Blob([new Uint8Array(silentWav())], { type: "audio/wav" }), "probe.wav");

  const response = await fetch(endpoint(baseUrl, "audio/transcriptions"), {
    method: "POST",
    headers: headersFor(provider, apiKey), // no Content-Type: fetch sets the boundary
    body: form,
  });

  const ms = Date.now() - started;

  if (!response.ok) {
    return `FAIL ${response.status} (${ms}ms) ${(await response.text()).slice(0, 90)}`;
  }

  const payload = (await response.json()) as { text?: string };
  // Silence in, silence out — reaching the endpoint at all is the result here.
  return `OK   (${ms}ms) silent probe accepted ${JSON.stringify((payload.text ?? "").slice(0, 30))}`;
}

async function probe(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
  task: AiTask,
  choice: ModelChoice,
): Promise<string> {
  if (task === "audio" && choice.audio === "transcriptions") {
    return probeTranscription(provider, apiKey, baseUrl, choice.slug);
  }
  return probeChat(provider, apiKey, baseUrl, choice.slug, PROBES[task]);
}

/** Walks one provider's three chains. Returns true if anything answered. */
async function checkProvider(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
): Promise<boolean> {
  const definition = providerDefinition(provider);
  console.log(
    `\n${definition.label}  ·  key …${apiKey.slice(-6)} (${apiKey.length} chars)  ·  ${baseUrl}`,
  );

  let anyAlive = false;

  for (const task of ["vision", "text", "audio"] as AiTask[]) {
    console.log(`  ${task.toUpperCase()}`);
    for (const choice of modelsFor(task, provider)) {
      let line: string;
      try {
        line = await probe(provider, apiKey, baseUrl, task, choice);
      } catch (error) {
        line = `FAIL ${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`;
      }
      if (line.startsWith("OK")) anyAlive = true;
      console.log(`    ${choice.slug.padEnd(50)} ${line}`);
    }
  }

  return anyAlive;
}

async function main() {
  const active = aiConfig();

  if (!ALL) {
    if (!active.ok) {
      console.log(active.reason);
      console.log("\nRun with --all to check every provider you have a key for.");
      process.exit(1);
    }

    const alive = await checkProvider(active.provider, active.apiKey, active.baseUrl);
    console.log(
      alive
        ? "\nAt least one model answered. Chains with a failing first rung will fall through."
        : "\nNo model answered. Check the key, or the provider's status page.",
    );
    return;
  }

  /*
   * --all deliberately reports only providers with a key, rather than listing
   * the others as failures. A missing key is a choice, not a fault, and
   * printing three screens of red for two providers nobody signed up for
   * would bury the one result that matters.
   */
  const configured: { provider: AiProvider; apiKey: string; baseUrl: string }[] = [];

  for (const provider of AI_PROVIDERS) {
    const definition = providerDefinition(provider);
    const apiKey = process.env[definition.keyEnv]?.trim();
    if (!apiKey) {
      console.log(`${definition.label.padEnd(24)} skipped — ${definition.keyEnv} is not set`);
      continue;
    }
    configured.push({
      provider,
      apiKey,
      baseUrl: process.env[definition.baseUrlEnv]?.trim() || definition.baseUrl,
    });
  }

  if (configured.length === 0) {
    console.log("\nNo provider keys found. Add at least one to .env.local and try again.");
    process.exit(1);
  }

  let anyAlive = false;
  for (const entry of configured) {
    anyAlive = (await checkProvider(entry.provider, entry.apiKey, entry.baseUrl)) || anyAlive;
  }

  console.log(
    `\nActive provider: ${active.ok ? `${active.label} (AI_PROVIDER=${active.provider})` : active.reason}`,
  );
  if (!anyAlive) console.log("No model answered on any provider.");
}

/*
 * A reachability check, not a capability one: the chat probes send text to
 * every model, including the vision chains, because a model that will not
 * answer a text prompt is certainly not going to read a photograph. Passing
 * here means the rung is alive and the key works, nothing more — for a real
 * accuracy comparison, run `npm run check:cnic` against each provider in turn.
 *
 * DO NOT READ THE TIMINGS AS PERFORMANCE. The probes cap max_tokens at 32,
 * which a reasoning model spends entirely on thinking before it has written a
 * word — so it is cut off mid-thought and looks catastrophically slow. One
 * model here measured 111s on the probe and 28s on a real complaint. These
 * numbers say "alive" or "not"; they do not rank the models.
 */
main().catch((error) => {
  console.error("Check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
