import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Every brand colour resolves through a CSS variable, so a section
      // of the page can restate the palette and everything inside it
      // follows — opacity modifiers included. The values live in
      // globals.css; these names are unchanged.
      colors: {
        theatre: "rgb(var(--c-theatre) / <alpha-value>)", // primary ink
        greentop: "rgb(var(--c-greentop) / <alpha-value>)", // secondary
        sage: "rgb(var(--c-sage) / <alpha-value>)", // app background
        porcelain: "rgb(var(--c-porcelain) / <alpha-value>)", // cards
        heartbeat: "rgb(var(--c-heartbeat) / <alpha-value>)", // accent
        amber: "rgb(var(--c-amber) / <alpha-value>)", // coverage midpoint
        graphite: "rgb(var(--c-graphite) / <alpha-value>)", // body text
        hairline: "rgb(var(--c-hairline) / <alpha-value>)", // card borders
      },
      // One superfamily. `display` is the same face at a heavier weight
      // and tighter tracking rather than a second typeface: revision
      // apps people rate — Amboss, Quizlet, Passmedicine — are sans
      // throughout, and let size and weight carry the hierarchy.
      fontFamily: {
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        display: "-0.021em",
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0, 0, 0, 0.06)",
      },
      maxWidth: {
        question: "720px",
      },
    },
  },
  plugins: [],
};
export default config;
