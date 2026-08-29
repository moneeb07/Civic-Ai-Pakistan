import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatNumber,
  formatSla,
  formatTimestamp,
  humanizeCategory,
  isOverdue,
} from "../src/lib/gov/format";

/*
 * Display helpers. `now` is injected everywhere a clock is involved so these
 * assert real behaviour rather than racing the system time.
 */

const NOW = new Date("2026-08-29T12:00:00Z");

describe("formatTimestamp", () => {
  it("uses relative time inside a week", () => {
    assert.equal(formatTimestamp("2026-08-29T09:00:00Z", NOW), "3 hours ago");
    assert.equal(formatTimestamp("2026-08-27T12:00:00Z", NOW), "2 days ago");
  });

  it("falls back to an absolute date beyond a week, where 'ago' stops being useful", () => {
    const formatted = formatTimestamp("2026-08-01T12:00:00Z", NOW);
    assert.match(formatted, /2026/);
    assert.ok(!formatted.includes("ago"));
  });

  it("returns an empty string for an unparseable value rather than 'Invalid Date'", () => {
    assert.equal(formatTimestamp("not-a-date", NOW), "");
  });
});

describe("isOverdue", () => {
  it("is true once the stage's SLA has elapsed", () => {
    // Entered 25 hours ago against a 24-hour target.
    assert.equal(isOverdue("2026-08-28T11:00:00Z", 24, NOW), true);
  });

  it("is false while still inside the target", () => {
    assert.equal(isOverdue("2026-08-29T06:00:00Z", 24, NOW), false);
  });

  it("is false when the stage has no SLA — an unknown deadline is not a missed one", () => {
    assert.equal(isOverdue("2020-01-01T00:00:00Z", null, NOW), false);
  });

  it("is false when the stage was never entered", () => {
    assert.equal(isOverdue(null, 24, NOW), false);
  });
});

describe("formatSla", () => {
  it("says days when the target divides evenly, hours otherwise", () => {
    assert.equal(formatSla(24), "1 day");
    assert.equal(formatSla(72), "3 days");
    assert.equal(formatSla(1), "1 hour");
    assert.equal(formatSla(6), "6 hours");
  });

  it("returns null when there is no target", () => {
    assert.equal(formatSla(null), null);
  });
});

describe("humanizeCategory", () => {
  it("turns the wire format into something an officer reads", () => {
    assert.equal(humanizeCategory("BROKEN_STREETLIGHT"), "Broken Streetlight");
    assert.equal(humanizeCategory("POTHOLE"), "Pothole");
  });

  it("passes null through", () => {
    assert.equal(humanizeCategory(null), null);
  });
});

describe("formatNumber", () => {
  it("formats with en-PK grouping", () => {
    assert.equal(formatNumber(1234), "1,234");
    assert.equal(formatNumber(0), "0");
  });
});
