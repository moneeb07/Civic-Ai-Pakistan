// MUST be first: everything below reads the provider's key as it is constructed.
import "./load-env.mts";

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename } from "node:path";

import { validateCnic, type CnicSide } from "../src/lib/cnic/validation";
import { aiConfig } from "../src/services/ai/chains";

/*
 * The validator is marked `server-only`, a package whose whole job is to throw
 * when it is imported outside a Next.js server render. That guard is correct
 * and worth keeping — it is what stops an API key being pulled into a client
 * bundle — so rather than weaken it, this script satisfies it: the module is
 * stubbed out in the require cache before the validator is loaded.
 *
 * This is safe precisely because it is a CLI run by a developer on their own
 * machine. Nothing here ships, and the key never leaves the process.
 */
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeJS.Module;

const { validateCnicImage, CnicValidationError } = await import(
  "../src/services/ai/cnic-validator"
);

/*
 * End-to-end check of the CNIC validation pipeline against the real model.
 *
 *   npm run check:cnic -- <image> [front|back] [more images…]
 *
 * Exists so the pipeline can be verified after swapping an API key WITHOUT
 * clicking through registration in a browser. Each UI attempt costs three
 * model calls and several minutes; this costs one call per image and prints
 * the whole decision, so a key change can be confirmed or ruled out in
 * seconds.
 *
 * It calls exactly the code the API route calls — the same validator, the same
 * decision function, the same thresholds. If this passes and the browser does
 * not, the fault is in the UI, not the pipeline, and that is worth knowing
 * before hunting for it.
 *
 * Nothing is written anywhere and no image leaves the machine except to the
 * model, exactly as it would in the app. CNIC numbers are never printed: the
 * script reports READABILITY, never content.
 */

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function mimeFor(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[extension] ?? null;
}

async function checkOne(path: string, side: CnicSide) {
  const label = `${basename(path)} (${side})`;

  if (!existsSync(path)) {
    console.log(`  ${label.padEnd(38)} SKIPPED — file not found`);
    return;
  }

  const mimeType = mimeFor(path);
  if (!mimeType) {
    console.log(`  ${label.padEnd(38)} SKIPPED — use a .jpg, .png or .webp`);
    return;
  }

  const bytes = readFileSync(path);
  const started = Date.now();

  try {
    const vision = await validateCnicImage({ bytes, mimeType }, side);

    /*
     * No local pixel signals, exactly as a gallery upload sends none — so this
     * measures what the MODEL could read, which is the half a key change
     * affects.
     */
    const result = validateCnic({ expectedSide: side, signals: null, vision });

    const verdict = result.state === "READABLE" ? "PASS" : "REJECT";
    console.log(
      `  ${label.padEnd(38)} ${verdict.padEnd(7)} score ${String(result.score).padStart(3)}  ${Date.now() - started}ms`,
    );
    console.log(
      `  ${"".padEnd(38)} model: ${vision.readability}, confidence ${vision.confidence.toFixed(2)}, side seen: ${vision.observedSide ?? "unsure"}`,
    );

    if (result.unreadableFields.length > 0) {
      console.log(`  ${"".padEnd(38)} could not read: ${result.unreadableFields.join(", ")}`);
    }
    if (result.instruction) {
      console.log(`  ${"".padEnd(38)} would tell the citizen: "${result.instruction}"`);
    }
  } catch (error) {
    if (error instanceof CnicValidationError) {
      const detail =
        error.reason === "rate_limited"
          ? `RATE LIMITED${error.retryAfterSeconds ? ` — retry in ~${error.retryAfterSeconds}s` : ""}`
          : error.reason.toUpperCase();
      console.log(`  ${label.padEnd(38)} ${detail}`);
      console.log(`  ${"".padEnd(38)} This is the API, not the image.`);
      return;
    }
    throw error;
  }

  console.log("");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Check the CNIC validation pipeline against the real model.

  npm run check:cnic -- front.jpg
  npm run check:cnic -- front.jpg front back.jpg back

Pass an image path, optionally followed by "front" or "back" (default front).
One model call per image. Prints the verdict, the score, and what the citizen
would be told — never the contents of the card.
`);
    return;
  }

  const config = aiConfig();
  if (!config.ok) {
    console.log(config.reason);
    process.exitCode = 1;
    return;
  }

  // A key is a secret: enough to confirm WHICH key is loaded, never enough to
  // use. The provider is named alongside it because the same check run against
  // three providers is the point — an unlabelled verdict is not comparable.
  console.log(
    `\n${config.label} · key …${config.apiKey.slice(-6)} (${config.apiKey.length} chars)\n`,
  );

  // Pair each path with its optional side argument.
  const jobs: { path: string; side: CnicSide }[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "front" || value === "back") continue;
    const next = args[index + 1];
    jobs.push({ path: value, side: next === "back" ? "back" : "front" });
  }

  for (const job of jobs) {
    await checkOne(job.path, job.side);
    // Spaced out, because the free tier allows 20 calls a minute and a burst
    // of them is exactly how you end up rate-limited mid-check.
    if (jobs.length > 1) await new Promise((resolve) => setTimeout(resolve, 3500));
  }
}

main().catch((error) => {
  console.error("Check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
