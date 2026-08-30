/*
 * The duplicate-detection agent's arithmetic.
 *
 * Three citizens reporting the same pothole should become three reports and
 * ONE issue. Getting that wrong in either direction is costly: merging two
 * genuinely different problems hides one of them from the department, and
 * failing to merge buries a badly-broken road under twenty separate tickets.
 *
 * So this deliberately produces THREE outcomes, not two — group, review,
 * separate — and the middle one is the whole point. Anything the scorer is
 * merely suspicious about is attached provisionally and flagged for a member
 * to confirm or split, never silently merged.
 *
 * Pure and framework-free: no database, no Gemini, no clock. Every input is
 * passed in, so the policy can be unit-tested directly.
 */

export interface IssueCandidate {
  id: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  /** Title, description and transcript concatenated — whatever text exists. */
  text: string;
  createdAt: Date;
}

export interface IncomingReport {
  category: string;
  latitude: number | null;
  longitude: number | null;
  text: string;
  createdAt: Date;
}

export type SimilarityDecision = "group" | "review" | "separate";

export interface SimilarityResult {
  score: number;
  decision: SimilarityDecision;
  distanceMeters: number | null;
  textScore: number;
  hoursApart: number;
  /** Plain-language account of the verdict, shown on the issue workspace. */
  rationale: string;
}

/*
 * -- Thresholds ----------------------------------------------------------
 *
 * Tuned around what "the same real-world problem" actually means on a street.
 */

/** At or above this, the match is confident enough to group without asking. */
export const GROUP_THRESHOLD = 0.82;
/** Between this and GROUP_THRESHOLD: plausible, but a member must confirm. */
export const REVIEW_THRESHOLD = 0.55;

/** Same spot for civic purposes — one pothole, one broken light. */
const NEAR_METERS = 60;
/** Same stretch of road or block. Still plausibly one problem. */
const BLOCK_METERS = 250;
/** Past this, two reports are about different places, whatever the words say. */
const FAR_METERS = 600;

/** Reports further apart in time than this are unlikely to be one live issue. */
const MAX_DAYS_APART = 21;

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance. Null when either point has no coordinates. */
export function distanceBetween(
  aLat: number | null,
  aLon: number | null,
  bLat: number | null,
  bLon: number | null,
): number | null {
  if (aLat === null || aLon === null || bLat === null || bLon === null) return null;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/*
 * Words too common in civic complaints to carry any signal. Without this,
 * "there is water on the road" and "there is a hole in the road" score as
 * similar purely on their filler.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "on", "in", "at",
  "of", "and", "or", "to", "for", "from", "with", "this", "that", "there",
  "here", "it", "its", "has", "have", "had", "please", "kindly", "near",
  "very", "some", "any", "our", "we", "i", "my", "you", "your", "he", "she",
  "they", "them", "issue", "problem", "complaint", "report", "area",
]);

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Keep Urdu/Arabic script alongside Latin — a report may be in either.
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/**
 * Jaccard overlap of meaningful words, 0–1.
 *
 * Chosen over anything cleverer because it needs no model, no network call and
 * no training data, and it degrades honestly: two texts sharing no vocabulary
 * score 0 rather than being confidently wrong. It is one of three signals, not
 * the decision.
 */
export function textSimilarity(a: string, b: string): number {
  const setA = tokenise(a);
  const setB = tokenise(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared++;

  return shared / (setA.size + setB.size - shared);
}

/** Distance mapped to 0–1, flat-topped so "close enough" is not a knife edge. */
function proximityScore(distanceMeters: number | null): number {
  // No coordinates on one side: contributes nothing rather than guessing.
  if (distanceMeters === null) return 0;
  if (distanceMeters <= NEAR_METERS) return 1;
  if (distanceMeters >= FAR_METERS) return 0;
  if (distanceMeters <= BLOCK_METERS) {
    return 1 - 0.3 * ((distanceMeters - NEAR_METERS) / (BLOCK_METERS - NEAR_METERS));
  }
  return 0.7 * (1 - (distanceMeters - BLOCK_METERS) / (FAR_METERS - BLOCK_METERS));
}

/** Recency overlap — a fresh report about a months-old issue is its own problem. */
function recencyScore(hoursApart: number): number {
  const days = hoursApart / 24;
  if (days <= 3) return 1;
  if (days >= MAX_DAYS_APART) return 0;
  return 1 - (days - 3) / (MAX_DAYS_APART - 3);
}

/*
 * Weights. Location dominates because civic problems are defined by where
 * they are: two reports of a pothole 5km apart are two potholes, however
 * identically they are worded.
 */
const WEIGHT_PROXIMITY = 0.55;
const WEIGHT_TEXT = 0.3;
const WEIGHT_RECENCY = 0.15;

/**
 * Scores one incoming report against one existing issue.
 *
 * Category is a gate rather than a weight: a pothole report is never the same
 * issue as a garbage report, no matter how close together they are. The one
 * exception is OTHER, which is a catch-all rather than a claim, so it is
 * allowed to match on the other signals with a penalty.
 */
export function scoreSimilarity(
  incoming: IncomingReport,
  candidate: IssueCandidate,
): SimilarityResult {
  const distanceMeters = distanceBetween(
    incoming.latitude,
    incoming.longitude,
    candidate.latitude,
    candidate.longitude,
  );
  const textScore = textSimilarity(incoming.text, candidate.text);
  const hoursApart =
    Math.abs(incoming.createdAt.getTime() - candidate.createdAt.getTime()) / 3_600_000;

  const sameCategory = incoming.category === candidate.category;
  const eitherIsOther = incoming.category === "OTHER" || candidate.category === "OTHER";

  const base =
    WEIGHT_PROXIMITY * proximityScore(distanceMeters) +
    WEIGHT_TEXT * textScore +
    WEIGHT_RECENCY * recencyScore(hoursApart);

  /*
   * A different, specific category is a hard no. Two named problems that
   * disagree are two problems — grouping them would hide one of them from the
   * department that has to fix it.
   */
  let score = base;
  if (!sameCategory) score = eitherIsOther ? base * 0.6 : 0;

  // Too far apart to be one place, whatever else agrees.
  if (distanceMeters !== null && distanceMeters > FAR_METERS) score = 0;
  // Too far apart in time to be one live issue.
  if (hoursApart / 24 > MAX_DAYS_APART) score = 0;

  const decision: SimilarityDecision =
    score >= GROUP_THRESHOLD ? "group" : score >= REVIEW_THRESHOLD ? "review" : "separate";

  return {
    score: Number(score.toFixed(4)),
    decision,
    distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
    textScore: Number(textScore.toFixed(4)),
    hoursApart: Number(hoursApart.toFixed(2)),
    rationale: explain({
      decision,
      sameCategory,
      distanceMeters,
      textScore,
      hoursApart,
    }),
  };
}

function explain(input: {
  decision: SimilarityDecision;
  sameCategory: boolean;
  distanceMeters: number | null;
  textScore: number;
  hoursApart: number;
}): string {
  const parts: string[] = [];

  parts.push(input.sameCategory ? "Same category" : "Different category");

  if (input.distanceMeters === null) {
    parts.push("no location to compare");
  } else {
    parts.push(`${Math.round(input.distanceMeters)}m apart`);
  }

  parts.push(`${Math.round(input.textScore * 100)}% wording overlap`);

  const days = Math.round(input.hoursApart / 24);
  parts.push(days <= 1 ? "reported within a day" : `${days} days apart`);

  const verdict =
    input.decision === "group"
      ? "Grouped as the same problem."
      : input.decision === "review"
        ? "Possibly the same problem — needs a member to confirm."
        : "Treated as a separate problem.";

  return `${parts.join(", ")}. ${verdict}`;
}

/**
 * Picks the best issue for an incoming report, if any.
 *
 * Returns the highest-scoring candidate along with its verdict. A "separate"
 * verdict means a new issue should be opened — the caller must not fall back
 * to the nearest match anyway.
 */
export function findBestMatch(
  incoming: IncomingReport,
  candidates: IssueCandidate[],
): { candidate: IssueCandidate; result: SimilarityResult } | null {
  let best: { candidate: IssueCandidate; result: SimilarityResult } | null = null;

  for (const candidate of candidates) {
    const result = scoreSimilarity(incoming, candidate);
    if (!best || result.score > best.result.score) best = { candidate, result };
  }

  if (!best || best.result.decision === "separate") return null;
  return best;
}
