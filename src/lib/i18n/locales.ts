/*
 * CivicAI will eventually serve citizens in several Pakistani languages.
 * Stage 1 ships English only, but the locale list and text direction live here
 * from the start so that adding Urdu is a translation job, not a refactor.
 */

export const LOCALES = [
  "en",
  "ur", // Urdu
  "pa", // Punjabi
  "sd", // Sindhi
  "ps", // Pashto
  "bal", // Balochi
  "skr", // Saraiki
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Scripts written right-to-left. Drives the `dir` attribute on <html>. */
const RTL_LOCALES = new Set<Locale>(["ur", "sd", "ps", "bal", "skr"]);

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ur: "اردو",
  pa: "پنجابی",
  sd: "سنڌي",
  ps: "پښتو",
  bal: "بلوچی",
  skr: "سرائیکی",
};
