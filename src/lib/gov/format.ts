/*
 * Display formatting for the government portal.
 *
 * Pure functions with no React and no server imports, so they are unit-tested
 * directly (tests/gov-format.test.ts) rather than through a rendered page.
 *
 * Everything is stored UTC and formatted in the viewer's own timezone — an
 * officer in Karachi and one in Islamabad read the same instant correctly
 * without the server guessing which they are.
 */

const NUMBER_FORMAT = new Intl.NumberFormat("en-PK");

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

const RELATIVE = new Intl.RelativeTimeFormat("en-PK", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Recent timestamps read better as "3 hours ago"; older ones as a real date. */
const RELATIVE_CUTOFF = 7 * DAY;

const ABSOLUTE = new Intl.DateTimeFormat("en-PK", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * "3 hours ago" for anything inside a week, "24 Aug 2026" beyond it.
 *
 * `now` is injectable so the tests are not racing the clock.
 */
export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const elapsed = now.getTime() - then.getTime();

  if (Math.abs(elapsed) >= RELATIVE_CUTOFF) {
    return ABSOLUTE.format(then);
  }

  if (Math.abs(elapsed) < MINUTE) {
    return RELATIVE.format(-Math.round(elapsed / 1000), "second");
  }
  if (Math.abs(elapsed) < HOUR) {
    return RELATIVE.format(-Math.round(elapsed / MINUTE), "minute");
  }
  if (Math.abs(elapsed) < DAY) {
    return RELATIVE.format(-Math.round(elapsed / HOUR), "hour");
  }
  return RELATIVE.format(-Math.round(elapsed / DAY), "day");
}

/**
 * Whether a stage has passed its department's target time.
 *
 * A soft signal only: nothing auto-transitions on it. Returns false when the
 * stage has no SLA or has not been entered — an unknown deadline is not a
 * missed one.
 */
export function isOverdue(
  stageEnteredAt: string | null,
  slaHours: number | null,
  now: Date = new Date(),
): boolean {
  if (!stageEnteredAt || slaHours === null) return false;

  const entered = new Date(stageEnteredAt);
  if (Number.isNaN(entered.getTime())) return false;

  return now.getTime() - entered.getTime() > slaHours * HOUR;
}

/** "12 hours" / "3 days" — the SLA as a person would say it. */
export function formatSla(slaHours: number | null): string | null {
  if (slaHours === null) return null;
  if (slaHours % 24 === 0 && slaHours >= 24) {
    const days = slaHours / 24;
    return `${formatNumber(days)} ${days === 1 ? "day" : "days"}`;
  }
  return `${formatNumber(slaHours)} ${slaHours === 1 ? "hour" : "hours"}`;
}

/** CIVIC_CATEGORIES are SCREAMING_SNAKE on the wire; officers read prose. */
export function humanizeCategory(category: string | null): string | null {
  if (!category) return null;
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
