import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

// Type (NIVARA_FLOW_AND_UI_PLAN.md §9.4): Fraunces for display, IBM Plex for interface and numbers,
// Noto for the Indian scripts we support (hi, mr, ta, bn). All self-hosted by Next at build time.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap", axes: ["opsz", "SOFT"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });
const deva = Noto_Sans_Devanagari({ variable: "--font-noto-deva", subsets: ["devanagari"], display: "swap" });
const taml = Noto_Sans_Tamil({ variable: "--font-noto-taml", subsets: ["tamil"], display: "swap" });
const beng = Noto_Sans_Bengali({ variable: "--font-noto-beng", subsets: ["bengali"], display: "swap" });

export const viewport: Viewport = { themeColor: "#0c1a1f", width: "device-width", initialScale: 1 };

export const metadata: Metadata = {
  title: { default: "Nivara", template: "%s · Nivara" },
  description: "Nivara: a real-time stress and trauma assessment module for the National Helpline Against Atrocities (14566).",
};

/** The site language (Phase P, P-D7) comes from the NEXT_LOCALE cookie; `<html lang>` follows it. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={`${fraunces.variable} ${plex.variable} ${plexMono.variable} ${deva.variable} ${taml.variable} ${beng.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
