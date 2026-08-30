import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  distanceBetween,
  findBestMatch,
  GROUP_THRESHOLD,
  REVIEW_THRESHOLD,
  scoreSimilarity,
  textSimilarity,
  type IssueCandidate,
} from "../src/lib/authority/similarity";

const BASE = new Date("2026-08-20T09:00:00Z");
const hoursLater = (h: number) => new Date(BASE.getTime() + h * 3_600_000);

/** G-10 Islamabad, roughly. */
const LAT = 33.6844;
const LON = 73.0479;

/** Moves a point north by roughly `metres`. */
function north(metres: number) {
  return LAT + metres / 111_320;
}

const potholeIssue: IssueCandidate = {
  id: "issue-1",
  category: "POTHOLE",
  latitude: LAT,
  longitude: LON,
  text: "Large pothole on the main road near the market causing traffic problems",
  createdAt: BASE,
};

describe("distanceBetween", () => {
  it("measures a known short distance", () => {
    const d = distanceBetween(LAT, LON, north(100), LON);
    assert.ok(d !== null && Math.abs(d - 100) < 2, `expected ~100m, got ${d}`);
  });

  it("returns null when either point has no coordinates", () => {
    assert.equal(distanceBetween(LAT, LON, null, null), null);
    assert.equal(distanceBetween(null, LON, LAT, LON), null);
  });
});

describe("textSimilarity", () => {
  it("scores shared meaningful vocabulary", () => {
    const score = textSimilarity(
      "large pothole on the main road",
      "pothole on main road is dangerous",
    );
    assert.ok(score > 0.3, `expected overlap, got ${score}`);
  });

  /*
   * The case the stop-word list exists for: two complaints made almost
   * entirely of filler must not read as similar.
   */
  it("does not score filler words as similarity", () => {
    const score = textSimilarity(
      "there is a problem in this area please",
      "we have an issue in the area kindly",
    );
    assert.ok(score < 0.2, `filler scored too high: ${score}`);
  });

  it("handles Urdu script without discarding it", () => {
    const score = textSimilarity("سڑک میں گڑھا ہے", "سڑک میں گڑھا بہت بڑا ہے");
    assert.ok(score > 0, "Urdu tokens were dropped entirely");
  });

  it("returns 0 for empty text rather than guessing", () => {
    assert.equal(textSimilarity("", "pothole on road"), 0);
  });
});

describe("scoreSimilarity", () => {
  it("groups two reports of the same problem at the same spot", () => {
    const result = scoreSimilarity(
      {
        category: "POTHOLE",
        latitude: north(15),
        longitude: LON,
        text: "Deep pothole on the main road near market, dangerous for traffic",
        createdAt: hoursLater(6),
      },
      potholeIssue,
    );

    assert.equal(result.decision, "group");
    assert.ok(result.score >= GROUP_THRESHOLD);
    assert.ok(result.distanceMeters !== null && result.distanceMeters < 60);
  });

  /*
   * The whole point of a three-way decision. Same category, same street, but
   * the wording gives little to go on — plausible, not certain. It must land
   * in review rather than being merged or discarded.
   */
  it("sends a plausible-but-uncertain match to review, not straight to grouping", () => {
    const result = scoreSimilarity(
      {
        category: "POTHOLE",
        latitude: north(220),
        longitude: LON,
        text: "Surface broken outside the school gate",
        createdAt: hoursLater(96),
      },
      potholeIssue,
    );

    assert.equal(result.decision, "review");
    assert.ok(result.score >= REVIEW_THRESHOLD && result.score < GROUP_THRESHOLD);
  });

  /*
   * Category is a gate, not a weight. Grouping a garbage report into a pothole
   * issue would hide the garbage from the department that has to collect it.
   */
  it("never groups two different specific categories, however close together", () => {
    const result = scoreSimilarity(
      {
        category: "GARBAGE",
        latitude: LAT,
        longitude: LON,
        text: "Large pothole on the main road near the market causing traffic problems",
        createdAt: BASE,
      },
      potholeIssue,
    );

    assert.equal(result.score, 0);
    assert.equal(result.decision, "separate");
  });

  it("keeps two identically-worded reports far apart as separate problems", () => {
    const result = scoreSimilarity(
      {
        category: "POTHOLE",
        latitude: LAT + 0.05, // ~5.5km
        longitude: LON,
        text: potholeIssue.text,
        createdAt: hoursLater(2),
      },
      potholeIssue,
    );

    assert.equal(result.decision, "separate");
  });

  it("does not attach a report raised months after the issue", () => {
    const result = scoreSimilarity(
      {
        category: "POTHOLE",
        latitude: LAT,
        longitude: LON,
        text: potholeIssue.text,
        createdAt: hoursLater(24 * 60),
      },
      potholeIssue,
    );

    assert.equal(result.score, 0);
    assert.equal(result.decision, "separate");
  });

  it("lets OTHER match on the remaining signals, at a penalty", () => {
    const result = scoreSimilarity(
      {
        category: "OTHER",
        latitude: north(20),
        longitude: LON,
        text: potholeIssue.text,
        createdAt: hoursLater(3),
      },
      potholeIssue,
    );

    assert.ok(result.score > 0, "OTHER was gated out entirely");
    assert.notEqual(result.decision, "group");
  });

  it("always explains its verdict", () => {
    const result = scoreSimilarity(
      {
        category: "POTHOLE",
        latitude: north(15),
        longitude: LON,
        text: potholeIssue.text,
        createdAt: hoursLater(1),
      },
      potholeIssue,
    );

    assert.ok(result.rationale.includes("Same category"));
    assert.ok(/\d+m apart/.test(result.rationale));
  });
});

describe("findBestMatch", () => {
  const far: IssueCandidate = {
    ...potholeIssue,
    id: "issue-far",
    latitude: LAT + 0.05,
  };

  it("returns the closest genuine match out of several candidates", () => {
    const match = findBestMatch(
      {
        category: "POTHOLE",
        latitude: north(10),
        longitude: LON,
        text: potholeIssue.text,
        createdAt: hoursLater(2),
      },
      [far, potholeIssue],
    );

    assert.equal(match?.candidate.id, "issue-1");
  });

  /*
   * The caller must open a NEW issue here. Returning the nearest candidate
   * anyway is exactly the blind merge this system is designed not to do.
   */
  it("returns null when nothing is close enough, rather than the nearest miss", () => {
    const match = findBestMatch(
      {
        category: "BROKEN_STREETLIGHT",
        latitude: LAT + 0.2,
        longitude: LON,
        text: "Streetlight not working outside the hospital",
        createdAt: hoursLater(5),
      },
      [far, potholeIssue],
    );

    assert.equal(match, null);
  });

  it("returns null for an empty candidate list", () => {
    assert.equal(
      findBestMatch(
        { category: "POTHOLE", latitude: LAT, longitude: LON, text: "x", createdAt: BASE },
        [],
      ),
      null,
    );
  });
});
