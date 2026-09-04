import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// Inter for everything a candidate reads. Drawn for interfaces at
// small sizes, which is what a clinical vignette on a phone between
// cases actually is, and its numerals line up in a table of
// percentages without fighting the prose.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Figures, countdowns, timers and references — the data face.
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
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
    // suppressHydrationWarning: the script in <head> adds a class to
    // <html> before React hydrates, which React would otherwise report
    // as an unexpected server/client difference.
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/*
          Marks the document as scripted before anything paints, so the
          reveal-on-scroll rules apply only where they can be undone.
          Without it, a page whose JavaScript fails to run stays hidden.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js')`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${robotoMono.variable} flex min-h-screen flex-col`}
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
