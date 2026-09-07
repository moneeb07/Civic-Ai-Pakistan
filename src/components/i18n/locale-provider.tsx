"use client";

import * as React from "react";

import { getDictionary, type Dictionary } from "@/lib/i18n";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/active-locale";
import { DEFAULT_LOCALE, getDirection, type Locale } from "@/lib/i18n/locales";

/*
 * The citizen's language, for client components.
 *
 * The locale is resolved on the SERVER from the cookie and handed down as a
 * prop, so the first paint is already in the right language. Deriving it on
 * the client instead would render English, hydrate, then swap — a flash of the
 * wrong language on every single page load.
 *
 * Switching writes the cookie and then reloads. That is deliberate, not
 * laziness: about a third of the screens a citizen passes through are SERVER
 * components, and their text was chosen during the render that produced the
 * HTML. No amount of client state retranslates those. A reload is one beat, it
 * is what changing an interface language does everywhere else, and it
 * guarantees server and client agree — which a partial client-side swap
 * would not.
 */

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (next: Locale) => void;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const setLocale = React.useCallback(
    (next: Locale) => {
      if (next === locale) return;

      /*
       * Written from the client rather than through a server action. The
       * choice is not a mutation of anything the server owns — it is a display
       * preference — and a round trip would put a spinner in front of a toggle
       * that should feel instant.
       *
       * SameSite=Lax keeps it off cross-site requests. There is no secret in
       * it, but a cookie that travels further than it needs to is still a
       * cookie that travels further than it needs to.
       */
      document.cookie = [
        `${LOCALE_COOKIE}=${next}`,
        "path=/",
        `max-age=${LOCALE_COOKIE_MAX_AGE}`,
        "samesite=lax",
      ].join("; ");

      window.location.reload();
    },
    [locale],
  );

  const value = React.useMemo<LocaleContextValue>(
    () => ({ locale, t: getDictionary(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * The dictionary for the active language.
 *
 * Replaces the module-level `const t = getDictionary()` that used to sit at the
 * top of every component file. That constant was evaluated once when the module
 * was first imported — before any citizen existed, let alone chose a language —
 * so it could only ever have been English.
 *
 * Falls back to English outside a provider rather than throwing. A component
 * rendered in isolation showing English is a far better failure than a crash.
 */
export function useT(): Dictionary {
  const context = React.useContext(LocaleContext);
  return context?.t ?? getDictionary(DEFAULT_LOCALE);
}

/** The active locale, its direction, and the setter — for the toggle itself. */
export function useLocale(): {
  locale: Locale;
  direction: "ltr" | "rtl";
  setLocale: (next: Locale) => void;
} {
  const context = React.useContext(LocaleContext);
  const locale = context?.locale ?? DEFAULT_LOCALE;
  return {
    locale,
    direction: getDirection(locale),
    setLocale: context?.setLocale ?? (() => {}),
  };
}
