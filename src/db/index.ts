import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";

import { clearStaleLock } from "./clear-stale-lock";
import { schema } from "./schema";

/*
 * CivicAI talks to PostgreSQL through Drizzle.
 *
 * Two drivers, one schema:
 *
 *   DATABASE_URL set   -> node-postgres against a real PostgreSQL server.
 *                         This is the production path.
 *   DATABASE_URL unset -> PGlite: PostgreSQL compiled to WASM, persisted to
 *                         ./.data/civicai. Same SQL engine, no server to run,
 *                         so a developer can clone and go. Development only.
 *
 * Both are PostgreSQL, so the schema and the generated migrations are identical
 * across the two paths — nothing is stubbed or emulated.
 */

export const LOCAL_DATA_DIR = "./.data/civicai";

function createDatabase() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const pool = new Pool({
      connectionString: url,
      // Managed Postgres providers generally require TLS; local servers do not.
      ssl: url.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
    });

    return drizzlePg(pool, { schema });
  }

  /*
   * `next build` imports route modules to collect page data, and Better Auth's
   * Drizzle adapter inspects the client as it is constructed. That happens with
   * NODE_ENV=production but without a request, so the guard must not fire then —
   * only when a real production server starts.
   */
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (isBuildPhase) {
    // Nothing is queried during a build, and a Pool does not connect until it
    // is. Hand back an inert client so the build never touches the filesystem
    // or the network.
    return drizzlePg(new Pool({ connectionString: "postgres://build-placeholder" }), {
      schema,
    });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production. The embedded PGlite fallback is for local development only.",
    );
  }

  // PGlite does not create intermediate directories.
  mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  // See clear-stale-lock.ts for why this is safe in this single-process setup.
  clearStaleLock(LOCAL_DATA_DIR);
  return drizzlePglite(new PGlite(LOCAL_DATA_DIR), { schema });
}


type Database = ReturnType<typeof createDatabase>;

/*
 * Next.js re-evaluates modules on hot reload, which would otherwise open a new
 * pool — or a second PGlite instance holding the same data directory — on every
 * edit. Cache on globalThis so there is exactly one instance per process.
 *
 * KNOWN LIMITATION, confirmed by direct investigation, not yet fully solved:
 * this cache does not fully protect PGlite specifically. Editing or adding a
 * source file while `npm run dev` is running can still leave the app reading
 * an empty database on every route from that point on, even though this same
 * process served correct data moments before, and the effect is identical
 * under both Turbopack and `next dev --webpack` — so it is not a bundler
 * choice to fix, but some deeper interaction between Next.js dev-mode's
 * server-module reloading and PGlite's single-writer, no-cross-instance-
 * coordination design. A genuine `new PGlite()` call very likely still runs a
 * second time somewhere in that reload path despite the check below, and two
 * live instances against one data directory corrupt each other's view.
 *
 * The one fully reliable recovery, verified repeatedly: a full process
 * restart (kill `next dev`, start it again) — never a partial/hot reload.
 * `clearStaleLock` below handles the OTHER, separate failure this data
 * directory is prone to (a stale lock left by an unclean kill, e.g. SIGKILL
 * or `npm run build` overwriting `.next` under a live `npm run dev`), which
 * IS fully fixed and verified across many clean restart cycles.
 *
 * `npm run build`/`start` are unaffected: production requires DATABASE_URL,
 * so PGlite is never opened there at all — this is a local-dev-only risk.
 */
const globalForDb = globalThis as unknown as { __civicaiDb?: Database };

function resolveDatabase(): Database {
  if (!globalForDb.__civicaiDb) {
    globalForDb.__civicaiDb = createDatabase();
  }
  return globalForDb.__civicaiDb;
}

/*
 * Exported lazily via a Proxy.
 *
 * `next build` imports every route module to collect page data. If the client
 * were constructed at module scope, a build would try to open a database
 * connection — and trip the production guard above — before any request exists.
 * Deferring to first property access means the connection opens on the first
 * real query instead.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = resolveDatabase();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
