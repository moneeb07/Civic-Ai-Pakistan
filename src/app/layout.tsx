import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { DEFAULT_LOCALE, getDirection } from "@/lib/i18n";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      dir={getDirection(DEFAULT_LOCALE)}
      className={`${inter.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
