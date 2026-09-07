"use client";

import type { ReactNode } from "react";

import { useLocale } from "@/components/i18n/locale-provider";

/*
 * Right-to-left, confined to the screens that are actually translated.
 *
 * `dir` used to sit on <html>, which is the textbook placement and was wrong
 * here for one specific reason: the landing page is permanently English, and
 * a document-level `dir="rtl"` mirrored it anyway. Flex rows reversed, the
 * logo jumped to the right, the hero buttons ran backwards, and the English
 * sentences ended up with their full stops on the left. The page was not
 * translated — it was just inside out.
 *
 * So direction is applied where translation is: the registration, dashboard,
 * report and auth shells. Anything outside them stays left-to-right, which is
 * correct, because anything outside them is still in English.
 *
 * The wrapper renders no box of its own — `display: contents` keeps it out of
 * the layout entirely, so dropping it into a grid or flex parent cannot change
 * how the children are placed.
 */
export function FlowDirection({ children }: { children: ReactNode }) {
  const { direction } = useLocale();

  return (
    <div dir={direction} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
