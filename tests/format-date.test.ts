import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatDateTime } from "../src/lib/civic/format-date";

/*
 * Regression test for a real server/client hydration mismatch.
 *
 * `date.toLocaleString()` with no explicit timeZone reads the RUNTIME's
 * default. A page rendered on the server (Node, wherever it is hosted) and
 * hydrated in a citizen's browser (wherever they are) essentially never
 * share a timezone, so the same instant renders as two different strings —
 * sometimes even a different CALENDAR DAY near midnight — and React discards
 * the server HTML and re-renders. That is the actual, demonstrated cause of
 * "the page looked right on the first load, then changed" for any date shown
 * anywhere in the app.
 *
 * The test proves it two ways: first that the OLD pattern (no timeZone
 * argument) really does disagree across environments — so this isn't a
 * theoretical risk — and second that `formatDate`/`formatDateTime` are
 * immune to it by construction, at an instant deliberately chosen to fall on
 * different calendar days in different timezones.
 */

// 02:30 UTC on 30 Aug — 29 Aug in US Pacific, already 30 Aug in Pakistan.
// The exact instant that exposes a timezone-dependent day boundary.
const BOUNDARY = new Date("2026-08-30T02:30:00Z");

function withTimeZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe("date formatting — server/client hydration safety", () => {
  it("demonstrates the bug: an unqualified toLocaleDateString disagrees across timezones", () => {
    const inLosAngeles = withTimeZone("America/Los_Angeles", () =>
      BOUNDARY.toLocaleDateString(),
    );
    const inKarachi = withTimeZone("Asia/Karachi", () => BOUNDARY.toLocaleDateString());

    // If this ever starts failing, the environment's Intl no longer reflects
    // TZ the way Node does today — re-verify the premise before touching
    // formatDate/formatDateTime, since the fix below depends on it.
    assert.notEqual(
      inLosAngeles,
      inKarachi,
      "expected the unqualified call to disagree — the premise this test depends on no longer holds",
    );
  });

  it("formatDate is identical regardless of the runtime's timezone", () => {
    const inLosAngeles = withTimeZone("America/Los_Angeles", () => formatDate(BOUNDARY));
    const inKarachi = withTimeZone("Asia/Karachi", () => formatDate(BOUNDARY));
    const inUTC = withTimeZone("UTC", () => formatDate(BOUNDARY));

    assert.equal(inLosAngeles, inKarachi);
    assert.equal(inKarachi, inUTC);
    // And it is specifically Pakistan's calendar day, not an average of the two.
    assert.equal(inKarachi, "30 Aug 2026");
  });

  it("formatDateTime is identical regardless of the runtime's timezone", () => {
    const inLosAngeles = withTimeZone("America/Los_Angeles", () =>
      formatDateTime(BOUNDARY),
    );
    const inKarachi = withTimeZone("Asia/Karachi", () => formatDateTime(BOUNDARY));

    assert.equal(inLosAngeles, inKarachi);
  });

  it("renders the expected Pakistan-local wall clock time", () => {
    // 02:30 UTC is 07:30 in Asia/Karachi (UTC+5, no DST).
    const result = withTimeZone("America/Los_Angeles", () => formatDateTime(BOUNDARY));
    assert.match(result, /7:30\s*am/i);
  });
});
