"use client";

import { Languages } from "lucide-react";

import { useLocale } from "@/components/i18n/locale-provider";
import { OFFERED_LOCALES } from "@/lib/i18n/active-locale";
import { LOCALE_LABELS } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/*
 * The language switch.
 *
 * Both options are shown at once rather than hidden behind a dropdown, and
 * that is the whole design. A citizen who cannot read English cannot read a
 * control labelled "Language" either — but they can recognise "اردو" sitting
 * next to "English" and press it. A menu that has to be understood before it
 * can be opened is no use to the person who needs it most.
 *
 * Each option is labelled in its OWN script for the same reason. "Urdu" spelt
 * in Latin letters is unreadable to exactly the audience it is offering
 * something to.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-surface p-0.5",
        className,
      )}
      role="group"
      aria-label="Language / زبان"
    >
      <Languages
        className="ms-1.5 size-3.5 shrink-0 text-muted"
        aria-hidden="true"
      />
      {OFFERED_LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={active}
            /*
             * `lang` on each button so a screen reader switches voice for the
             * Urdu one. Without it the label is announced with English
             * phonetics, which is unintelligible.
             */
            lang={option}
            className={cn(
              "min-h-8 rounded-full px-3 text-[0.8125rem] font-semibold transition-colors",
              active
                ? "bg-civic-700 text-white"
                : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            {LOCALE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
