import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rankRows, SMOOTHING_ISSUES } from "../src/lib/gov/ranking";
import { rankAuthorities, MIN_ISSUES_TO_RANK } from "../src/lib/gov/performance";

/*
 * The shared ranking algorithm now backs three different league tables: the
 * public authority page, and the role-scoped peer tables an officer sees one
 * level below themselves. These pin the properties that make it honest, and —
 * most importantly — that the public page still gets byte-identical answers
 * through the shared path, since that refactor could otherwise silently
 * reorder a published accountability table.
 */

const row = (name: string, reported: number, inProcess: number, resolved: number) => ({
  name,
  reported,
  inProcess,
  resolved,
});

describe("rankRows", () => {
  it("pulls a tiny perfect record toward the group average", () => {
    // 2-of-2 looks like 100%, but two closed issues is not evidence.
    const ranked = rankRows([row("Tiny", 0, 0, 2), row("Large", 0, 200, 800)], 3);
    const tiny = ranked.find((r) => r.name === "Tiny")!;

    assert.equal(tiny.resolutionRate, 100);
    assert.ok(tiny.rankingScore < 100, "smoothed score must be below the raw rate");
  });

  it("barely moves a large, established caseload", () => {
    const ranked = rankRows([row("Large", 0, 200, 800)], 10);
    const large = ranked[0];

    // 80% raw; with m=10 against its own 1000 issues it should stay close.
    assert.ok(Math.abs(large.rankingScore - large.resolutionRate) < 2);
  });

  it("honours the caller's evidence threshold", () => {
    const inputs = [row("Small", 0, 0, 4)];

    // The same row is rankable for members (bar 3) and not for orgs (bar 10).
    assert.equal(rankRows(inputs, 3)[0].ranked, true);
    assert.equal(rankRows(inputs, 10)[0].ranked, false);
  });

  it("never places a row with no work above one that has done some", () => {
    const ranked = rankRows([row("Idle", 0, 0, 0), row("Working", 5, 5, 10)], 3);

    assert.equal(ranked[0].name, "Working");
    assert.equal(ranked[1].rankingScore, 0);
  });

  it("keeps unranked rows below every ranked one, whatever they score", () => {
    // Perfect but unproven vs. mediocre but established.
    const ranked = rankRows([row("Unproven", 0, 0, 1), row("Proven", 0, 60, 40)], 10);

    assert.equal(ranked[0].name, "Proven");
    assert.equal(ranked[0].ranked, true);
    assert.equal(ranked[1].ranked, false);
    assert.equal(ranked[1].rank, 0, "unranked rows carry no position");
  });

  it("assigns dense positions starting at 1, skipping unranked rows", () => {
    const ranked = rankRows(
      [row("A", 0, 10, 30), row("B", 0, 20, 20), row("Tiny", 0, 0, 1)],
      10,
    );

    assert.deepEqual(
      ranked.map((r) => r.rank),
      [1, 2, 0],
    );
  });

  it("is deterministic for identical rows", () => {
    const ranked = rankRows([row("Bravo", 0, 5, 5), row("Alpha", 0, 5, 5)], 3);

    // Same score and same workload — name breaks the tie, so order is stable.
    assert.deepEqual(ranked.map((r) => r.name), ["Alpha", "Bravo"]);
  });

  it("handles an empty set without dividing by zero", () => {
    assert.deepEqual(rankRows([], 10), []);
  });

  it("exposes the smoothing constant it actually uses", () => {
    assert.equal(SMOOTHING_ISSUES, 10);
  });
});

describe("rankAuthorities still behaves identically through the shared path", () => {
  it("produces the same ordering and scores as ranking the rows directly", () => {
    const authorities = [
      { authorityId: "a", authorityName: "Alpha", authorityCode: "A", reported: 2, inProcess: 8, resolved: 40, citizenReports: 60 },
      { authorityId: "b", authorityName: "Bravo", authorityCode: "B", reported: 5, inProcess: 5, resolved: 10, citizenReports: 25 },
      { authorityId: "c", authorityName: "Small", authorityCode: "C", reported: 0, inProcess: 0, resolved: 2, citizenReports: 2 },
    ];

    const viaAdapter = rankAuthorities(authorities);
    const viaShared = rankRows(
      authorities.map((a) => ({ ...a, name: a.authorityName })),
      MIN_ISSUES_TO_RANK,
    );

    assert.deepEqual(
      viaAdapter.map((r) => [r.authorityName, r.rank, r.rankingScore, r.ranked]),
      viaShared.map((r) => [r.name, r.rank, r.rankingScore, r.ranked]),
    );
  });

  it("does not leak the internal `name` field the adapter adds", () => {
    const [first] = rankAuthorities([
      { authorityId: "a", authorityName: "Alpha", authorityCode: "A", reported: 1, inProcess: 1, resolved: 1, citizenReports: 3 },
    ]);

    assert.equal("name" in first, false, "adapter must strip its tie-break key");
  });
});
