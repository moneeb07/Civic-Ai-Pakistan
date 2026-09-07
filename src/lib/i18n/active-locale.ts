import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/*
 * Where the citizen's language choice lives.
 *
 * A cookie rather than a URL segment or a database column, for three reasons
 * that all point the same way: the choice has to survive a reload, it has to
 * be readable by SERVER components (which render before any client code runs,
 * so localStorage is invisible to them), and it has to work for somebody who
 * has not signed in yet — the registration flow is the first thing they
 * translate, and there is no account to hang a preference off at that point.
 *
 * Deliberately not HttpOnly: the toggle is a client component and reads this
 * back to show which language is active. There is nothing sensitive in it.
 */
export const LOCALE_COOKIE = "civicai-locale";

/** A year. The choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Narrows an untrusted string to a Locale.
 *
 * The cookie is client-writable, so its value is an assertion by the browser
 * and nothing more. Anything unrecognised falls back to English rather than
 * being trusted into a dictionary lookup.
 */
export function parseLocale(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  return (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

/**
 * The locales a citizen can actually pick, in the order the toggle shows them.
 *
 * `LOCALES` lists every language CivicAI intends to serve eventually; this is
 * the subset that has a dictionary written. Offering a language with no
 * translation would silently render English under an Urdu label, which reads
 * as a broken app rather than as an unfinished one.
 */
export const OFFERED_LOCALES: readonly Locale[] = ["en", "ur"];
