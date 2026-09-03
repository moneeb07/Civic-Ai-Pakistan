/*
 * Loads .env.local into process.env, at module scope.
 *
 * This lives in its own module for one reason: ES modules evaluate ALL of a
 * file's imports before any of its own body runs. A loadEnv() call at the top
 * of the seed script therefore executes AFTER `src/lib/auth` has already been
 * imported and constructed its database adapter — by which point DATABASE_URL
 * is still unset and the app has silently fallen back to the PGlite
 * development database, against which the seed then fails with
 * "relation does not exist".
 *
 * Imported FIRST by the seed, it is evaluated first, so the environment is in
 * place before anything reads it.
 *
 * Next.js loads .env.local itself; standalone tsx scripts do not, and this is
 * not worth a dotenv dependency.
 */

import { readFileSync } from "node:fs";

function loadEnv(file: string) {
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return; // Absent file is fine — the environment may already carry the values.
  }

  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1]!;
    // Anything already exported wins, so `DATABASE_URL=… npm run db:seed` works.
    if (process.env[key] !== undefined) continue;

    process.env[key] = match[2]!.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv(".env.local");
loadEnv(".env");
