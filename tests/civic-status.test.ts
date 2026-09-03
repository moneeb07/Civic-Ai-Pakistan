import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALL_STATUS_PRESENTATIONS,
  CIVIC_STATUSES,
  deriveStatus,
  statusIndex,
  statusPresentation,
} from "../src/lib/civic/status";

/*
 * The status lifecycle is now the single source every badge, tracker, table
 * cell and chart legend reads from. That makes it load-bearing: a change here
 * silently restyles the entire product, so the invariants are pinned.
 */
describe("deriveStatus", () => {
  /*
   * The database stores no status column — each department defines its own
   * ordered workflow — so the three states a citizen understands are computed
   * from the department's own stages. These four cases are the whole mapping.
   */
  it("reports an unassigned issue as REPORTED", () => {
    assert.equal(deriveStatus({ stageName: null, isResolved: false }), "REPORTED");
    assert.equal(deriveStatus({ stageName: undefined, isResolved: false }), "REPORTED");
  });

  it("reports an issue on a department stage as IN_PROCESS", () => {
    assert.equal(
      deriveStatus({ stageName: "Inspection scheduled", isResolved: false }),
      "IN_PROCESS",
    );
  });

  it("reports a terminal stage as RESOLVED", () => {
    assert.equal(deriveStatus({ stageName: "Repaired", isResolved: true }), "RESOLVED");
  });

  it("lets resolved win even if the stage name is missing", () => {
    // A closed issue whose stage was later deleted must not read as "Reported".
    assert.equal(deriveStatus({ stageName: null, isResolved: true }), "RESOLVED");
  });
});

describe("status presentation", () => {
  it("gives every status a label, a description and an icon", () => {
    for (const status of CIVIC_STATUSES) {
      const presentation = statusPresentation(status);
      assert.ok(presentation.label.length > 0, `${status} has no label`);
      assert.ok(presentation.description.length > 0, `${status} has no description`);
      assert.ok(presentation.icon.length > 0, `${status} has no icon`);
    }
  });

  /*
   * Colour is never the only channel. Red/amber/green is precisely the axis a
   * colour-blind reader cannot separate, so an icon and a word must always
   * travel with it — a status that lost its icon would fail silently, looking
   * perfectly fine to whoever made the change.
   */
  it("never lets two statuses share an icon", () => {
    const icons = ALL_STATUS_PRESENTATIONS.map((p) => p.icon);
    assert.equal(new Set(icons).size, icons.length, "two statuses share an icon");
  });

  it("never lets two statuses share a colour class", () => {
    const fills = ALL_STATUS_PRESENTATIONS.map((p) => p.fill);
    assert.equal(new Set(fills).size, fills.length, "two statuses share a fill");
  });

  it("orders the lifecycle so the tracker fills left to right", () => {
    assert.equal(statusIndex("REPORTED"), 0);
    assert.equal(statusIndex("IN_PROCESS"), 1);
    assert.equal(statusIndex("RESOLVED"), 2);
  });

  it("points every colour class at a status token, never a raw palette colour", () => {
    /*
     * The regression this guards: the old citizen tracker drew itself with
     * `bg-danger` (the FORM-ERROR colour) and raw `amber-500`, so the citizen
     * and government screens were drifting apart on the same three states.
     */
    for (const presentation of ALL_STATUS_PRESENTATIONS) {
      for (const [name, value] of Object.entries({
        text: presentation.text,
        bg: presentation.bg,
        border: presentation.border,
        fill: presentation.fill,
      })) {
        assert.match(
          value,
          /-status-(reported|process|resolved)/,
          `${presentation.status}.${name} does not use a status token: ${value}`,
        );
      }
    }
  });
});
