import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Mono, Noto_Sans_Tamil } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

// One family for every script we support (en, hi, mr, ta, bn), self-hosted by Next at build time.
const noto = Noto_Sans({ variable: "--font-noto", subsets: ["latin", "latin-ext"], display: "swap" });
const deva = Noto_Sans_Devanagari({ variable: "--font-noto-deva", subsets: ["devanagari"], display: "swap" });
const taml = Noto_Sans_Tamil({ variable: "--font-noto-taml", subsets: ["tamil"], display: "swap" });
const beng = Noto_Sans_Bengali({ variable: "--font-noto-beng", subsets: ["bengali"], display: "swap" });
const mono = Noto_Sans_Mono({ variable: "--font-noto-mono", subsets: ["latin"], display: "swap" });

export const viewport: Viewport = { themeColor: "#1f3a5f", width: "device-width", initialScale: 1 };

export const metadata: Metadata = {
  title: "NHAA Assist",
  appleWebApp: { capable: true, title: "NHAA 14566" },
  description: "Support for people contacting the National Helpline Against Atrocities (14566)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${noto.variable} ${deva.variable} ${taml.variable} ${beng.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
