import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseDepartmentCategories,
  routeToDepartment,
} from "../src/lib/authority/routing";

const WATER = {
  id: "d-water",
  name: "Water Management",
  categories: ["WATER_LEAKAGE", "DRAINAGE_PROBLEM", "OPEN_MANHOLE"],
};
const ROADS = {
  id: "d-roads",
  name: "Road & Infrastructure",
  categories: ["POTHOLE", "ROAD_DAMAGE", "DAMAGED_FOOTPATH"],
};
const MUNICIPAL = {
  id: "d-municipal",
  name: "Municipal Services",
  categories: ["GARBAGE", "BROKEN_STREETLIGHT", "OTHER"],
};

const ALL = [WATER, ROADS, MUNICIPAL];

describe("routeToDepartment", () => {
  it("routes a category to the one department that declares it", () => {
    const result = routeToDepartment("WATER_LEAKAGE", ALL);

    assert.equal(result.departmentId, "d-water");
    assert.equal(result.confidence, 1);
    assert.equal(result.source, "category_map");
  });

  it("routes from configuration, not from any hardcoded knowledge of CDA", () => {
    // The same category, handed to a completely different set of departments,
    // must follow the configuration it is given.
    const rehomed = routeToDepartment("WATER_LEAKAGE", [
      { id: "d-utilities", name: "Utilities", categories: ["WATER_LEAKAGE"] },
    ]);

    assert.equal(rehomed.departmentId, "d-utilities");
    assert.equal(rehomed.confidence, 1);
  });

  /*
   * Two departments claiming one category is a misconfiguration, not a crash.
   * It routes somewhere deterministic and says it is ambiguous so an admin can
   * fix the overlap.
   */
  it("flags an overlapping configuration instead of picking silently", () => {
    const overlapping = routeToDepartment("GARBAGE", [
      MUNICIPAL,
      { id: "d-waste", name: "Waste Management", categories: ["GARBAGE"] },
    ]);

    assert.equal(overlapping.source, "ambiguous");
    assert.ok(overlapping.confidence < 1);
    assert.match(overlapping.rationale, /Municipal Services and Waste Management/);
  });

  it("is deterministic when departments overlap", () => {
    const a = routeToDepartment("GARBAGE", [
      MUNICIPAL,
      { id: "d-waste", name: "Waste Management", categories: ["GARBAGE"] },
    ]);
    const b = routeToDepartment("GARBAGE", [
      { id: "d-waste", name: "Waste Management", categories: ["GARBAGE"] },
      MUNICIPAL,
    ]);

    assert.equal(a.departmentId, b.departmentId);
  });

  it("falls back to whichever department accepts OTHER", () => {
    const result = routeToDepartment("DAMAGED_PUBLIC_INFRASTRUCTURE", ALL);

    assert.equal(result.departmentId, "d-municipal");
    assert.equal(result.source, "catch_all");
    assert.ok(result.confidence > 0 && result.confidence < 0.5);
  });

  /*
   * The honest outcome. An unroutable issue is left visibly unassigned rather
   * than dumped on an arbitrary department, where it would become someone's
   * problem by accident and hide the misconfiguration that caused it.
   */
  it("leaves an issue unrouted when nothing claims it and there is no catch-all", () => {
    const result = routeToDepartment("POTHOLE", [WATER]);

    assert.equal(result.departmentId, null);
    assert.equal(result.source, "unrouted");
    assert.equal(result.confidence, 0);
  });

  it("ignores departments that declare no categories at all", () => {
    const result = routeToDepartment("POTHOLE", [
      { id: "d-empty", name: "Newly Created", categories: [] },
      ROADS,
    ]);

    assert.equal(result.departmentId, "d-roads");
  });

  it("always explains itself", () => {
    for (const category of ["WATER_LEAKAGE", "GARBAGE", "OTHER", "POTHOLE"]) {
      const result = routeToDepartment(category, ALL);
      assert.ok(result.rationale.length > 0, `${category} routed with no reason given`);
    }
  });
});

describe("parseDepartmentCategories", () => {
  it("reads a stored JSON array", () => {
    assert.deepEqual(parseDepartmentCategories('["POTHOLE","GARBAGE"]'), [
      "POTHOLE",
      "GARBAGE",
    ]);
  });

  /*
   * A single corrupt row must not take routing down for every other
   * department, so bad input degrades to "handles nothing".
   */
  it("degrades to an empty list on malformed or missing data", () => {
    assert.deepEqual(parseDepartmentCategories(null), []);
    assert.deepEqual(parseDepartmentCategories(""), []);
    assert.deepEqual(parseDepartmentCategories("not json"), []);
    assert.deepEqual(parseDepartmentCategories('{"a":1}'), []);
    assert.deepEqual(parseDepartmentCategories('["POTHOLE", 7, null]'), ["POTHOLE"]);
  });
});
