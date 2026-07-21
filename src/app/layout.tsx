import type { Metadata } from "next";
import { Newsreader, Albert_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
  // Next 14 has no fallback metrics for Newsreader; Georgia stands in.
  adjustFontFallback: false,
});

const albertSans = Albert_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-albert-sans",
  display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-spline-mono",
  display: "swap",
});

// While NEXT_PUBLIC_LAUNCHED !== "true" the site stays private: search
// engines are told not to index it, and public sign-ups are closed.
const launched = process.env.NEXT_PUBLIC_LAUNCHED === "true";

export const metadata: Metadata = {
  metadataBase: new URL("https://pinardapp.com"),
  title: "Pinard — intelligent MRCOG revision",
  description:
    "Intelligent MRCOG revision, grounded in the evidence. Adaptive study plans and exam-style questions for MRCOG candidates worldwide.",
  robots: launched ? undefined : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body
        className={`${newsreader.variable} ${albertSans.variable} ${splineSansMono.variable} flex min-h-screen flex-col`}
      >
        <SiteHeader />
        <main className="mx-auto w-full max-w-question flex-1 px-4 py-8 sm:py-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
