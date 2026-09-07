import { en } from "./dictionaries/en";
import { ur } from "./dictionaries/ur";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/*
 * Deliberately minimal. Components never hard-code copy — they read it from a
 * dictionary — but there is no routing, negotiation or async loading machinery
 * until a second language actually exists.
 *
 * Urdu is now written. The remaining locales in locales.ts are declared
 * intentions, not shipped languages — see OFFERED_LOCALES in active-locale.ts,
 * which is the list the toggle actually shows. A locale with no dictionary
 * falls back to English here rather than rendering blanks.
 */

/*
 * The dictionary shape, with every string WIDENED to `string`.
 *
 * en.ts is written `as const`, which makes each value its own literal type —
 * `"Sign In"` rather than `string`. That is useful for the English source but
 * fatal for a second locale: it makes the Urdu dictionary's type the literal
 * English sentence, so every translated line is a type error saying that
 * "سائن اِن کریں" is not assignable to "Sign In". Which is true, and is the
 * entire point of a translation.
 *
 * Widening once, here, keeps the `as const` discipline in en.ts and lets any
 * locale satisfy the same shape.
 */
type Widen<T> = T extends string
  ? string
  : T extends object
    ? { -readonly [K in keyof T]: Widen<T[K]> }
    : T;

export type Dictionary = Widen<typeof en>;

const dictionaries: Partial<Record<Locale, Dictionary>> = {
  en,
  ur,
};

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] ?? en;
}

export { DEFAULT_LOCALE, type Locale };
export { getDirection, LOCALES, LOCALE_LABELS } from "./locales";
