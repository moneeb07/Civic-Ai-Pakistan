import "server-only";

import { cookies } from "next/headers";

import { getDictionary, type Dictionary } from "./index";
import { LOCALE_COOKIE, parseLocale } from "./active-locale";
import { getDirection, type Locale } from "./locales";

/*
 * Reading the citizen's language on the server.
 *
 * Server components cannot use the client context — they render before any of
 * it exists — so they read the cookie directly. `cookies()` is request-scoped,
 * which is the property that matters: two citizens on different languages hit
 * the same server process, and a module-level constant would serve one of them
 * the other's language.
 *
 * That request-scoping is also why the dictionary is fetched per render rather
 * than held in a module constant, the way it used to be. `const t =
 * getDictionary()` at the top of a file is evaluated ONCE per process, so it
 * could never have been anything but English.
 */

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

/** The dictionary for this request. Use in server components in place of `t`. */
export async function getRequestDictionary(): Promise<Dictionary> {
  return getDictionary(await getRequestLocale());
}

/** Locale plus its text direction, for the <html> element. */
export async function getRequestDirection(): Promise<"ltr" | "rtl"> {
  return getDirection(await getRequestLocale());
}
