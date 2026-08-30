import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import { clearStaleLock } from "../src/db/clear-stale-lock";

/*
 * Regression test for the "works on the first run, breaks on the next one"
 * database bug: PGlite leaves postmaster.pid / .s.PGSQL.5432.lock.out behind
 * after any unclean process kill and then refuses to reopen its own data
 * directory. Reproduced directly against this project's actual
 * ./.data/civicai during investigation — a SIGKILL of the dev server was all
 * it took.
 *
 * Runs against a throwaway temp directory, never the real data directory, so
 * this can safely assert exactly which files are removed and — just as
 * importantly — which are left untouched.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "civicai-lock-test-"));
});

after(() => {
  // Best-effort: leaving a leftover temp dir is harmless, but tidy up anyway.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("clearStaleLock", () => {
  it("removes a stale postmaster.pid", () => {
    writeFileSync(join(dir, "postmaster.pid"), "-42\n/tmp/pglite/base\n1788034389\n5432\n");
    clearStaleLock(dir);
    assert.equal(existsSync(join(dir, "postmaster.pid")), false);
  });

  it("removes a stale .s.PGSQL.5432.lock.out", () => {
    writeFileSync(join(dir, ".s.PGSQL.5432.lock.out"), "");
    clearStaleLock(dir);
    assert.equal(existsSync(join(dir, ".s.PGSQL.5432.lock.out")), false);
  });

  it("removes both when both are present", () => {
    writeFileSync(join(dir, "postmaster.pid"), "-42");
    writeFileSync(join(dir, ".s.PGSQL.5432.lock.out"), "");
    clearStaleLock(dir);
    assert.equal(existsSync(join(dir, "postmaster.pid")), false);
    assert.equal(existsSync(join(dir, ".s.PGSQL.5432.lock.out")), false);
  });

  it("is a silent no-op when there is nothing to clear", () => {
    assert.doesNotThrow(() => clearStaleLock(dir));
  });

  /*
   * The safety property that matters most: this must never remove anything
   * other than the two exact, known lock artifacts. A version of this that
   * globbed or wiped the directory would risk real citizen/authority data
   * the moment its assumptions were even slightly wrong.
   */
  it("never touches anything other than the two known lock file names", () => {
    mkdirSync(join(dir, "base"));
    writeFileSync(join(dir, "base", "16384"), "not a real page, just a marker");
    mkdirSync(join(dir, "pg_wal"));
    writeFileSync(join(dir, "pg_wal", "000000010000000000000001"), "wal data");
    writeFileSync(join(dir, "PG_VERSION"), "16");
    writeFileSync(join(dir, "postmaster.pid"), "-42");
    writeFileSync(join(dir, ".s.PGSQL.5432.lock.out"), "");
    // A file that merely LOOKS related must not be swept up by a careless glob.
    writeFileSync(join(dir, "postmaster.pid.backup"), "keep me");

    clearStaleLock(dir);

    assert.equal(existsSync(join(dir, "postmaster.pid")), false);
    assert.equal(existsSync(join(dir, ".s.PGSQL.5432.lock.out")), false);
    assert.equal(existsSync(join(dir, "base", "16384")), true);
    assert.equal(existsSync(join(dir, "pg_wal", "000000010000000000000001")), true);
    assert.equal(existsSync(join(dir, "PG_VERSION")), true);
    assert.equal(existsSync(join(dir, "postmaster.pid.backup")), true);
  });
});
