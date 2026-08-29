import { en } from "./dictionaries/en";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/*
 * Deliberately minimal. Components never hard-code copy — they read it from a
 * dictionary — but there is no routing, negotiation or async loading machinery
 * until a second language actually exists.
 *
 * Adding Urdu later means: write `dictionaries/ur.ts` satisfying `Dictionary`,
 * register it below, and resolve the active locale from the user's preference.
 */

export type Dictionary = typeof en;

const dictionaries: Partial<Record<Locale, Dictionary>> = {
  en,
};

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] ?? en;
}

export { DEFAULT_LOCALE, type Locale };
export { getDirection, LOCALES, LOCALE_LABELS } from "./locales";
