/*
 * The ONE way a timestamp is turned into text anywhere in CivicAI.
 *
 * `date.toLocaleString()` with no arguments reads the RUNTIME's default
 * locale and timezone. For a page rendered on the server (Node, wherever it
 * happens to be hosted) and then hydrated in a citizen's browser (wherever
 * THEY are), those two runtimes essentially never agree — so the exact same
 * timestamp comes out as two different strings, and React's hydration
 * mismatch check discards the server-rendered HTML and re-renders from
 * scratch. That is a real, user-visible bug: a page that looks fine on first
 * load and then visibly re-paints, or in stricter build settings throws an
 * error, depending only on which timezone the visitor's device happens to
 * report.
 *
 * The fix is not to detect the visitor's timezone — that reintroduces the
 * exact same mismatch, since the server render still has no idea what it is.
 * It is to STOP asking the runtime for its default at all: every date in
 * CivicAI is about a civic issue in Pakistan, so every date is always shown
 * in Pakistan Standard Time, in the same format, on the server and in every
 * browser, with no ambiguity to disagree about.
 */

const LOCALE = "en-GB";
const TIME_ZONE = "Asia/Karachi";

/** "30 Aug 2026" */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

/** "30 Aug 2026, 6:45 pm" */
export function formatDateTime(date: Date): string {
  return date.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  });
}
