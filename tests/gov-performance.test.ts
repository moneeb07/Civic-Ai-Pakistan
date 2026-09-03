import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  rankAuthorities,
  summarise,
  type AuthorityPerformanceInput,
} from "../src/lib/gov/performance";

const make = (
  name: string,
  reported: number,
  inProcess: number,
  resolved: number,
): AuthorityPerformanceInput => ({
  authorityId: name.toLowerCase(),
  authorityName: name,
  authorityCode: name.slice(0, 3).toUpperCase(),
  reported,
  inProcess,
  resolved,
  citizenReports: (reported + inProcess + resolved) * 3,
});

describe("rankAuthorities", () => {
  it("reports the plain resolution rate people expect to see", () => {
    const [row] = rankAuthorities([make("Alpha", 10, 10, 80)]);

    assert.equal(row.totalIssues, 100);
    assert.equal(row.openIssues, 20);
    assert.equal(row.resolutionRate, 80);
  });

  /*
   * The headline fairness case from the brief: B has a better rate on a much
   * smaller caseload. It should still be able to rank above A — the rate is
   * real — but the gap must be narrowed by how little evidence B has.
   */
  it("lets a smaller authority with a better rate rank above a larger one", () => {
    const ranked = rankAuthorities([make("Alpha", 10, 10, 80), make("Beta", 1, 1, 18)]);

    const alpha = ranked.find((r) => r.authorityName === "Alpha")!;
    const beta = ranked.find((r) => r.authorityName === "Beta")!;

    assert.equal(alpha.resolutionRate, 80);
    assert.equal(beta.resolutionRate, 90);
    assert.equal(beta.rank, 1);
    // Beta's advantage is shrunk toward the average by its smaller caseload.
    assert.ok(beta.rankingScore < beta.resolutionRate);
  });

  /*
   * The abuse the smoothing exists to prevent: a token authority with two
   * closed issues must not top a table above one that has resolved hundreds.
   */
  it("does not let a 2-of-2 authority outrank a proven large one", () => {
    const ranked = rankAuthorities([
      make("Large", 100, 100, 800),
      make("Tiny", 0, 0, 2),
    ]);

    assert.equal(ranked[0].authorityName, "Large");
    assert.equal(ranked[0].rank, 1);

    // Shown, with its real numbers, but explicitly not placed in the table.
    assert.equal(ranked[1].authorityName, "Tiny");
    assert.equal(ranked[1].ranked, false);
    assert.equal(ranked[1].rank, 0);
    assert.equal(ranked[1].resolutionRate, 100);
  });

  it("marks authorities below the evidence threshold as unranked", () => {
    const ranked = rankAuthorities([make("Small", 2, 2, 5), make("Big", 5, 5, 40)]);

    assert.equal(ranked.find((r) => r.authorityName === "Small")!.ranked, false);
    assert.equal(ranked.find((r) => r.authorityName === "Big")!.ranked, true);
  });

  it("barely moves an authority with a large, established caseload", () => {
    const [row] = rankAuthorities([make("Large", 100, 100, 800)]);
    assert.ok(Math.abs(row.rankingScore - row.resolutionRate) < 3);
  });

  /*
   * An authority that has done nothing has no record to judge, and must never
   * appear to outperform one that has actually worked.
   */
  it("never places an authority with no issues above one that has worked", () => {
    const ranked = rankAuthorities([make("Empty", 0, 0, 0), make("Working", 5, 5, 10)]);

    assert.equal(ranked[0].authorityName, "Working");
    assert.equal(ranked[1].authorityName, "Empty");
    assert.equal(ranked[1].ranked, false);
    assert.equal(ranked[1].resolutionRate, 0);
  });

  it("assigns dense ranks starting at 1", () => {
    const ranked = rankAuthorities([
      make("A", 10, 10, 40),
      make("B", 10, 10, 20),
      make("C", 10, 10, 60),
    ]);

    assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
    assert.equal(ranked[0].authorityName, "C");
  });

  it("is deterministic when two authorities are identical", () => {
    const first = rankAuthorities([make("Zed", 10, 10, 10), make("Abe", 10, 10, 10)]);
    const second = rankAuthorities([make("Abe", 10, 10, 10), make("Zed", 10, 10, 10)]);

    assert.deepEqual(
      first.map((r) => r.authorityName),
      second.map((r) => r.authorityName),
    );
    assert.equal(first[0].authorityName, "Abe");
  });

  it("handles an empty roster without dividing by zero", () => {
    assert.deepEqual(rankAuthorities([]), []);
  });
});

describe("summarise", () => {
  it("adds up the national totals", () => {
    const totals = summarise(rankAuthorities([make("A", 10, 10, 80), make("B", 0, 0, 20)]));

    assert.equal(totals.issues, 120);
    assert.equal(totals.resolved, 100);
    assert.equal(totals.reported, 10);
    assert.equal(totals.inProcess, 10);
    assert.equal(totals.resolutionRate, 83.3);
  });

  it("returns zeroes rather than NaN when nothing has been reported", () => {
    const totals = summarise(rankAuthorities([make("A", 0, 0, 0)]));
    assert.equal(totals.resolutionRate, 0);
    assert.equal(totals.issues, 0);
  });
});
