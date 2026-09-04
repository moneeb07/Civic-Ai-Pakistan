/*
 * The one ranking algorithm, shared by every league table in CivicAI.
 *
 * There are now three of them — authorities on the public page, and the
 * role-scoped peer tables an officer sees one level below themselves
 * (organisations for a platform admin, departments for an org head, members
 * for a department head). They must all rank the same way. A second
 * implementation is how a department comes to be 3rd on one screen and 5th on
 * another, and nobody can say which is right.
 *
 * So the maths lives here once, framework-free and unit-testable, and every
 * caller is a thin adapter over it.
 *
 * Why not a plain resolution rate: it is dishonest in both directions. A
 * 2-of-2 department would top the table over one that resolved 800 of 1000,
 * and a pure count would reward whoever was handed the most work. The fix is
 * Bayesian shrinkage toward the group average, weighted by evidence.
 */

/** How much evidence a row needs before its own rate speaks for itself. */
export const SMOOTHING_ISSUES = 10;

export interface RankableInput {
  /** Stable identity, used only for tie-breaking determinism. */
  name: string;
  reported: number;
  inProcess: number;
  resolved: number;
}

export interface RankedFields {
  totalIssues: number;
  /** Not yet resolved: reported + in process. */
  openIssues: number;
  /** Plain resolved ÷ total, 0–100. What people expect to see. */
  resolutionRate: number;
  /** The smoothed score the ordering actually uses, 0–100. */
  rankingScore: number;
  /** False when the caseload is too small to judge honestly. */
  ranked: boolean;
  /** 1-based position, or 0 when `ranked` is false. */
  rank: number;
}

function rate(resolved: number, total: number): number {
  return total === 0 ? 0 : (resolved / total) * 100;
}

/**
 * Scores and orders any set of comparable rows, most effective first.
 *
 * `minToRank` is a parameter rather than a constant because the honest
 * evidence bar depends on what is being compared: ten issues is a reasonable
 * floor for a whole authority, and an absurd one for a single officer who may
 * only ever carry a handful at a time. Callers pick it; the maths does not
 * change.
 *
 * Rows with no issues at all are included but always last: they have no record
 * to judge, and handing them the group average would let someone who has done
 * nothing outrank someone who has done a great deal.
 */
export function rankRows<T extends RankableInput>(
  inputs: T[],
  minToRank: number,
): (T & RankedFields)[] {
  const totalResolved = inputs.reduce((sum, row) => sum + row.resolved, 0);
  const totalIssues = inputs.reduce(
    (sum, row) => sum + row.reported + row.inProcess + row.resolved,
    0,
  );

  // The group average every row is measured against.
  const groupRate = totalIssues === 0 ? 0 : totalResolved / totalIssues;

  const scored = inputs.map((row) => {
    const total = row.reported + row.inProcess + row.resolved;

    /*
     * resolved + (prior × m) over total + m. With m = SMOOTHING_ISSUES, a
     * 2-of-2 row scores near the group average rather than 100%, while a
     * 800-of-1000 row is barely moved at all.
     */
    const smoothed =
      total === 0
        ? 0
        : ((row.resolved + groupRate * SMOOTHING_ISSUES) / (total + SMOOTHING_ISSUES)) * 100;

    return {
      ...row,
      totalIssues: total,
      openIssues: row.reported + row.inProcess,
      resolutionRate: Number(rate(row.resolved, total).toFixed(1)),
      rankingScore: Number(smoothed.toFixed(1)),
      ranked: total >= minToRank,
      rank: 0,
    };
  });

  scored.sort((a, b) => {
    // Unrankable rows always sit below ranked ones, whatever they score.
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;

    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    // Tie broken by who carried more work, then by name for determinism.
    if (b.totalIssues !== a.totalIssues) return b.totalIssues - a.totalIssues;
    return a.name.localeCompare(b.name);
  });

  let position = 0;
  return scored.map((row) => {
    if (!row.ranked) return { ...row, rank: 0 };
    position += 1;
    return { ...row, rank: position };
  });
}
