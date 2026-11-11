import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Geist,
  Hanken_Grotesk,
  Host_Grotesk,
  Instrument_Sans,
  Schibsted_Grotesk,
} from "next/font/google";

/**
 * The type trial behind the design preview: the same words, the same
 * controls and the same figures, set in each interface face that was
 * considered, beside the one the site uses today. Local only.
 */
export const metadata: Metadata = { title: "Type trial", robots: { index: false, follow: false } };

const geist = Geist({ subsets: ["latin"], variable: "--f-geist", display: "swap" });
const host = Host_Grotesk({ subsets: ["latin"], variable: "--f-host", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--f-hanken", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-instrument", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--f-schibsted", display: "swap" });

const FACES = [
  { name: "Source Sans 3 (today)", family: "var(--font-ui)" },
  { name: "Geist", family: "var(--f-geist)" },
  { name: "Host Grotesk", family: "var(--f-host)" },
  { name: "Hanken Grotesk", family: "var(--f-hanken)" },
  { name: "Instrument Sans", family: "var(--f-instrument)" },
  { name: "Schibsted Grotesk", family: "var(--f-schibsted)" },
];

function Specimen({ name, family, dark }: { name: string; family: string; dark: boolean }) {
  const ink = dark ? "#EAF2EC" : "#0F3D33";
  const body = dark ? "rgba(234,242,236,0.78)" : "rgba(28,36,33,0.78)";
  const line = dark ? "rgba(255,255,255,0.14)" : "#DDE3DF";
  return (
    <div
      style={{
        background: dark ? "#082620" : "#F7F8F5",
        color: body,
        fontFamily: `${family}, system-ui, sans-serif`,
        padding: "28px 28px 30px",
        borderRadius: 20,
        border: `1px solid ${line}`,
      }}
    >
      <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>{name}</p>
      <h2
        style={{
          fontFamily: "var(--font-serif), Georgia, serif",
          fontVariationSettings: "'opsz' 72",
          fontWeight: 400,
          fontSize: 54,
          lineHeight: 1.0,
          letterSpacing: "-0.03em",
          color: ink,
          margin: "14px 0 0",
        }}
      >
        Revise your MRCOG Part 2 from the latest guidance
      </h2>
      <p style={{ fontSize: 19, lineHeight: 1.5, margin: "18px 0 0", maxWidth: "34rem" }}>
        SBA and EMQ sets written from current RCOG Green-top Guidelines, NICE guidance and
        high-impact review articles. Every explanation names the source it came from.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            background: dark ? "#EAF2EC" : "#0F3D33",
            color: dark ? "#082620" : "#fff",
            fontWeight: 600,
            fontSize: 16,
            padding: "13px 22px",
            borderRadius: 999,
          }}
        >
          Try the questions
        </span>
        <span style={{ border: `1px solid ${line}`, color: ink, fontWeight: 600, fontSize: 16, padding: "12px 22px", borderRadius: 999 }}>
          Join the pilot or waitlist
        </span>
        <span style={{ fontSize: 14, marginLeft: 6 }}>Full refund within 14 days.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 26 }}>
        <div>
          {["Aspirin to prevent pre-eclampsia", "Screening for gestational diabetes at 16 weeks", "Thromboprophylaxis with LMWH"].map((t, i) => (
            <div
              key={t}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                border: `1px solid ${line}`,
                borderRadius: 14,
                padding: "11px 14px",
                marginTop: i ? 8 : 0,
                fontSize: 15.5,
                color: dark ? "#EAF2EC" : "#1C2421",
                background: dark ? "rgba(255,255,255,0.04)" : "#fff",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 99,
                  border: `1px solid ${line}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {"ABC"[i]}
              </span>
              {t}
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
            <div>
              <p style={{ fontSize: 13, margin: 0 }}>Readiness</p>
              <p style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.03em", color: ink, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                72%
              </p>
            </div>
            <div>
              <p style={{ fontSize: 13, margin: 0 }}>Days to go</p>
              <p style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.03em", color: ink, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                48
              </p>
            </div>
            <div>
              <p style={{ fontSize: 13, margin: 0 }}>Questions</p>
              <p style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.03em", color: ink, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                1,264
              </p>
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>
            Today&rsquo;s session: 18 questions from Preterm birth, Consent and Ovarian masses, at 70 and
            110 minutes. 37+0 to 38+6 weeks; BMI 34 kg/m².
          </p>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
            Try the questions &nbsp; How it works &nbsp; Pricing &nbsp; Sign in
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TypeTrial() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div
      data-wide=""
      className={`bleed ${geist.variable} ${host.variable} ${hanken.variable} ${instrument.variable} ${schibsted.variable}`}
      style={{ padding: "24px 32px 60px" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1500, margin: "0 auto" }}>
        {FACES.map((f, i) => (
          <Specimen key={f.name} {...f} dark={i % 2 === 1} />
        ))}
      </div>
    </div>
  );
}
