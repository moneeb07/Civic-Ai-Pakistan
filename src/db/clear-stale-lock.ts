import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/*
 * Recovers from an unclean shutdown of the PREVIOUS local-dev process.
 *
 * PGlite is an embedded PostgreSQL, and Postgres refuses to start against a
 * data directory that looks like it is already owned by a running server —
 * it leaves `postmaster.pid` and a `.s.PGSQL.<port>.lock.out` file behind for
 * exactly that check. That check is correct for a real multi-process server,
 * but wrong here: db/index.ts's `resolveDatabase()` already guarantees at
 * most one PGlite instance exists PER NODE PROCESS via a globalThis cache,
 * and this app only ever runs one such process against `./.data/civicai` at a
 * time — there is no second legitimate owner these files could be protecting
 * against.
 *
 * Without this, killing the dev process any way other than a clean exit
 * (Ctrl+C twice, closing the terminal, `npm run build` overwriting `.next`
 * out from under a running `npm run dev`, an OS sleep/wake, a crash) leaves
 * the lock behind, and PGlite aborts on every subsequent start —
 * "Aborted(). Build with -sASSERTIONS for more info." — with no path back
 * except manually deleting the whole data directory and losing all local
 * data. That is the exact shape of "works on the first run, breaks on the
 * next one" for anyone running this app locally.
 *
 * Deleting only these two files, and only by their exact known names, mirrors
 * PostgreSQL's own documented recovery step for this situation (removing a
 * stale postmaster.pid once you are sure no server actually holds it) — it
 * never touches base/, pg_wal/, or any other directory holding real data.
 *
 * The one case this does not protect against — two dev processes genuinely
 * running at once against this directory — is not a realistic risk for how
 * this project is actually run (a second `next dev` fails immediately on the
 * port, before this code path is ever reached), so accepting it here is what
 * makes ordinary crash recovery automatic instead of a manual, data-losing
 * fix every time.
 */
export function clearStaleLock(dataDir: string): void {
  for (const name of ["postmaster.pid", ".s.PGSQL.5432.lock.out"]) {
    const path = join(dataDir, name);
    if (existsSync(path)) {
      try {
        rmSync(path);
      } catch {
        // Best-effort: if this can't be removed, PGlite's own error is still
        // clearer than failing silently here.
      }
    }
  }
}
