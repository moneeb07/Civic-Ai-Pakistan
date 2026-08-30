import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "../src/lib/civic/next-path";

/*
 * `?next=` decides where someone lands immediately after typing their
 * password — the moment they are least likely to check the address bar. So it
 * is validated rather than trusted.
 */
describe("safeNextPath", () => {
  it("allows an ordinary internal path", () => {
    assert.equal(safeNextPath("/authority"), "/authority");
    assert.equal(safeNextPath("/dashboard/reports"), "/dashboard/reports");
  });

  it("rejects an absolute URL to another site", () => {
    assert.equal(safeNextPath("https://evil.example/steal"), null);
    assert.equal(safeNextPath("http://evil.example"), null);
  });

  /*
   * The one people forget: "//evil.example" is a protocol-relative URL, so a
   * browser treats it as an external site even though it starts with a slash.
   */
  it("rejects protocol-relative URLs", () => {
    assert.equal(safeNextPath("//evil.example"), null);
    assert.equal(safeNextPath("/\\evil.example"), null);
  });

  it("rejects anything that is not a path", () => {
    assert.equal(safeNextPath("javascript:alert(1)"), null);
    assert.equal(safeNextPath("authority"), null);
  });

  it("treats missing or empty input as no destination", () => {
    assert.equal(safeNextPath(null), null);
    assert.equal(safeNextPath(undefined), null);
    assert.equal(safeNextPath(""), null);
  });
});
