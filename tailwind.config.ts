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
        graphite: "#232A27", // body text
        hairline: "#DCE5DF", // card borders
      },
      fontFamily: {
        display: ["var(--font-newsreader)", "Georgia", "serif"],
        sans: ["var(--font-albert-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-spline-mono)", "ui-monospace", "monospace"],
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
