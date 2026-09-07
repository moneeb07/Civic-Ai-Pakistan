import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDirection } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CivicAI — Your Voice. Your City. Your Right to Be Heard.",
    template: "%s · CivicAI",
  },
  description:
    "CivicAI helps citizens in Pakistan report civic problems and track them through to resolution.",
};

export const viewport: Viewport = {
  themeColor: "#006A4E",
  width: "device-width",
  initialScale: 1,
};

/*
 * The locale is resolved HERE, on the server, from the cookie — so the very
 * first byte of HTML already carries the right language and the right text
 * direction. Deciding it on the client instead would paint English, hydrate,
 * and then swap: a visible flash of the wrong language on every page load, and
 * a `dir` attribute that changes after layout, which moves the whole page.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={`${inter.variable} h-full`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
