/*
 * Public authority performance — the accountability numbers citizens see.
 *
 * The hard part here is not the arithmetic, it is not misleading anyone. Two
 * naive rankings are both dishonest in opposite directions:
 *
 *   by resolved COUNT — a huge authority that resolves 40% of a vast workload
 *                       outranks a small one that resolves 95% of its own
 *   by resolution RATE — an authority with 2 issues and both closed sits above
 *                       one that has resolved 800 of 1000
 *
 * So the ranking uses a smoothed rate: each authority's resolution rate is
 * pulled toward the national average, and the pull weakens as its caseload
 * grows. An authority with a handful of issues has not yet earned a strong
 * claim either way; one with hundreds has. This is ordinary Bayesian
 * shrinkage, and the UI explains it in plain language rather than presenting
 * a bare number as objective truth.
 *
 * Pure and framework-free so the ranking policy is unit-testable.
 */

import { rankRows } from "./ranking";

export interface AuthorityPerformanceInput {
  authorityId: string;
  authorityName: string;
  authorityCode: string;
  reported: number;
  inProcess: number;
  resolved: number;
  /** Citizen reports behind those issues — the workload actually carried. */
  citizenReports: number;
}

export interface AuthorityPerformance extends AuthorityPerformanceInput {
  totalIssues: number;
  /** Not yet resolved: reported + in process. */
  openIssues: number;
  /** Plain resolved ÷ total, 0–100. What people expect to see. */
  resolutionRate: number;
  /** The smoothed score the ranking actually uses, 0–100. */
  rankingScore: number;
  /**
   * False when the authority has too small a caseload to rank honestly. Such
   * rows are still shown, with their real numbers — they are simply not
   * placed in the league table.
   */
  ranked: boolean;
  /** 1-based position, or 0 when `ranked` is false. */
  rank: number;
}

/**
 * How much evidence an authority needs before its own rate speaks for itself.
 *
 * At this many issues the score sits halfway between the national average and
 * the authority's own rate; well beyond it, the average stops mattering. Ten
 * is deliberately low — enough to stop a 2-of-2 authority topping the table,
 * not so high that it flattens genuine differences.
 */
export { SMOOTHING_ISSUES } from "./ranking";

/**
 * Below this many issues an authority is shown but not ranked.
 *
 * Smoothing alone is not quite enough: an authority with two closed issues
 * still scores a little above a large authority resolving 80% of a thousand,
 * and topping a public accountability table on a sample of two is not a claim
 * worth defending. Saying "not enough data yet" is both more honest and more
 * useful than inventing a position for it.
 */
export const MIN_ISSUES_TO_RANK = 10;

/** Plain percentage, guarding the empty case. Used by summarise() below. */
function rate(resolved: number, total: number): number {
  return total === 0 ? 0 : (resolved / total) * 100;
}

/**
 * Ranks authorities, most effective first.
 *
 * A thin adapter over rankRows() in ./ranking.ts, which is shared with the
 * role-scoped peer tables inside the government portal. The maths lives there
 * so a department cannot be 3rd on one screen and 5th on another; this
 * function only supplies the evidence threshold appropriate to whole
 * authorities and keeps the historical field names.
 */
export function rankAuthorities(
  inputs: AuthorityPerformanceInput[],
): AuthorityPerformance[] {
  /*
   * `name` is only the shared ranker's tie-break key. It is deleted on the way
   * out rather than left on the DTO, so nothing downstream starts depending on
   * a duplicate of authorityName that only exists as an implementation detail.
   */
  return rankRows(
    inputs.map((row) => ({ ...row, name: row.authorityName })),
    MIN_ISSUES_TO_RANK,
  ).map((row) => {
    const scored: Record<string, unknown> = { ...row };
    delete scored.name;
    return scored as unknown as AuthorityPerformance;
  });
}

/** The national totals shown above the table. */
export function summarise(rows: AuthorityPerformance[]) {
  const citizenReports = rows.reduce((sum, row) => sum + row.citizenReports, 0);
  const issues = rows.reduce((sum, row) => sum + row.totalIssues, 0);
  const resolved = rows.reduce((sum, row) => sum + row.resolved, 0);
  const inProcess = rows.reduce((sum, row) => sum + row.inProcess, 0);
  const reported = rows.reduce((sum, row) => sum + row.reported, 0);

  return {
    citizenReports,
    issues,
    reported,
    inProcess,
    resolved,
    resolutionRate: Number(rate(resolved, issues).toFixed(1)),
  };
}
