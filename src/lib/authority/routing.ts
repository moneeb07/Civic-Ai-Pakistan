/*
 * The routing agent: which department should work this problem?
 *
 * Routing is driven entirely by what each department DECLARES it handles
 * (`department.categories`), never by a hardcoded map of CDA's structure. An
 * admin who creates a "Street Lighting" department and gives it
 * BROKEN_STREETLIGHT immediately changes where those reports go, with no code
 * change. That is the difference between a configurable system and a demo.
 *
 * Pure and framework-free: departments are passed in, so the policy can be
 * tested without a database.
 */

export interface RoutableDepartment {
  id: string;
  name: string;
  /** Civic categories this department has declared it handles. */
  categories: string[];
}

export type RoutingSource = "category_map" | "ambiguous" | "catch_all" | "unrouted";

export interface RoutingResult {
  departmentId: string | null;
  departmentName: string | null;
  /** 0–1. How sure the routing is — surfaced to members, never hidden. */
  confidence: number;
  source: RoutingSource;
  /** Plain-language reason, shown on the issue so routing is never a black box. */
  rationale: string;
}

/**
 * Picks a department for a category.
 *
 * Four outcomes, in order:
 *
 *   one department claims it   — confident, routed
 *   several claim it           — routed to the first by name, flagged ambiguous
 *                                so an admin can fix the overlapping config
 *   nobody claims it, but a
 *   department handles OTHER   — routed there as a catch-all, low confidence
 *   nobody at all              — left unrouted rather than guessed
 *
 * The last case matters: an unrouted issue sits in the admin's queue visibly
 * unassigned, which is honest. Dumping it on an arbitrary department would
 * make it someone's problem by accident and hide the misconfiguration.
 */
export function routeToDepartment(
  category: string,
  departments: RoutableDepartment[],
): RoutingResult {
  const active = departments.filter((dept) => dept.categories.length > 0);

  const matches = active
    .filter((dept) => dept.categories.includes(category))
    // Sorted so the result is deterministic when several departments overlap —
    // the same report must never route two different ways on two runs.
    .sort((a, b) => a.name.localeCompare(b.name));

  if (matches.length === 1) {
    return {
      departmentId: matches[0].id,
      departmentName: matches[0].name,
      confidence: 1,
      source: "category_map",
      rationale: `${matches[0].name} handles ${category}.`,
    };
  }

  if (matches.length > 1) {
    const chosen = matches[0];
    return {
      departmentId: chosen.id,
      departmentName: chosen.name,
      confidence: 0.6,
      source: "ambiguous",
      rationale: `${matches
        .map((dept) => dept.name)
        .join(" and ")} both handle ${category}. Routed to ${chosen.name} — an admin can reassign it.`,
    };
  }

  const catchAll = active
    .filter((dept) => dept.categories.includes("OTHER"))
    .sort((a, b) => a.name.localeCompare(b.name))[0];

  if (catchAll) {
    return {
      departmentId: catchAll.id,
      departmentName: catchAll.name,
      confidence: 0.35,
      source: "catch_all",
      rationale: `No department handles ${category}. Sent to ${catchAll.name}, which takes uncategorised issues.`,
    };
  }

  return {
    departmentId: null,
    departmentName: null,
    confidence: 0,
    source: "unrouted",
    rationale: `No department handles ${category}. Waiting for an admin to assign it.`,
  };
}

/** Reads the JSON array stored in `department.categories`, defensively. */
export function parseDepartmentCategories(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // A malformed row must not take down routing for every other department.
    return [];
  }
}
