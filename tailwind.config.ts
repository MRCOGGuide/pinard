import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        theatre: "#0F3D33", // primary ink — headings, primary buttons, logo
        greentop: "#2F6D5B", // secondary — links, active states, correct answers
        sage: "#EDF3EE", // app background
        porcelain: "#FDFDFB", // cards, question surfaces
        heartbeat: "#D64562", // accent, sparingly — trace, streaks, incorrect, key CTAs
        // Coverage only: the midpoint of the red→amber→green run on the
        // practise bars. Muted deliberately so it sits with the deep
        // green rather than shouting over it.
        amber: "#C0801F",
        graphite: "#232A27", // body text
        hairline: "#DCE5DF", // card borders
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
