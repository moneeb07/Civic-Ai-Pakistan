import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";

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
  return drizzlePglite(new PGlite(LOCAL_DATA_DIR), { schema });
}

type Database = ReturnType<typeof createDatabase>;

/*
 * Next.js re-evaluates modules on hot reload, which would otherwise open a new
 * pool — or a second PGlite instance holding the same data directory — on every
 * edit. Cache on globalThis so there is exactly one instance per process.
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
