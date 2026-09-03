/*
 * Preflight for `npm run dev`.
 *
 * The local development database is PGlite — PostgreSQL compiled to WASM,
 * living in ./.data/civicai. It allows exactly ONE process to hold that
 * directory. A second `next dev` opening it does not fail politely: it
 * corrupts the data directory, and the corruption only surfaces later as
 *
 *     RuntimeError: Aborted() ... at Module._pg_initdb
 *
 * by which point every table is unreadable and the only fix is to delete the
 * database and re-migrate. That has already happened more than once, which is
 * why this check exists rather than a line in a README nobody reads at the
 * moment they need it.
 *
 * Two jobs:
 *   1. Refuse to start when another dev server already holds the port.
 *   2. Clear a stale postmaster.pid left by an unclean shutdown, which is safe
 *      precisely because job 1 has proved no server is running.
 *
 * Runs as `predev`, so `npm run dev` triggers it automatically. It never
 * touches a real PostgreSQL setup: with DATABASE_URL set, PGlite is not used
 * at all and the whole check is skipped.
 */

import { createServer } from "node:net";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data", "civicai");
const DEV_PORT = Number(process.env.PORT ?? 3000);

/** Resolves true when nothing else holds the port. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code !== "EADDRINUSE");
    });
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

async function main() {
  // A real PostgreSQL server has none of these constraints.
  if (process.env.DATABASE_URL) return;

  if (!(await portIsFree(DEV_PORT))) {
    console.error(
      [
        "",
        `Refusing to start: something is already listening on port ${DEV_PORT}.`,
        "",
        "The local database (PGlite, ./.data/civicai) allows one writer. Starting a",
        "second dev server against it CORRUPTS it — every table becomes unreadable",
        "and the database has to be rebuilt from scratch.",
        "",
        "Stop the other server first:",
        "",
        "  pkill -f 'next dev'",
        "",
        `Or run this one on a different port with a different database:`,
        "",
        `  PORT=3001 DATABASE_URL=... npm run dev`,
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  /*
   * Nothing is running, so any postmaster.pid here is left over from a
   * previous shutdown. PGlite refuses to open the directory while it exists,
   * which is what turns "I stopped the server" into "now my scripts can't
   * read the database either". Safe to remove only because the port check
   * above already established that no server holds it.
   */
  const stale = [
    path.join(DATA_DIR, "postmaster.pid"),
    path.join(DATA_DIR, ".s.PGSQL.5432.lock.out"),
  ].filter(existsSync);

  for (const file of stale) rmSync(file, { force: true });

  if (stale.length > 0) {
    console.log(`Cleared ${stale.length} stale PGlite lock file(s) from a previous run.`);
  }
}

main().catch((error) => {
  // A failing preflight must never block development on its own account.
  console.warn("Dev preflight check could not run:", error instanceof Error ? error.message : error);
});
