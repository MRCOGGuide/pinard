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

        // The same palette named by the job each colour does, and the
        // layer the dark theme is defined against, since only a role
        // can change value without its name becoming a lie. The 1,674
        // brand-named usages have all moved over; the brand names above
        // survive as the values these point at, and nothing in src/
        // names one directly.
        ground: "rgb(var(--c-ground) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        sunk: "rgb(var(--c-sunk) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-strong": "rgb(var(--c-ink-strong) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        "on-brand": "rgb(var(--c-on-brand) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--c-accent-ink) / <alpha-value>)",
        good: "rgb(var(--c-good) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        scrim: "rgb(var(--c-scrim) / <alpha-value>)",
      },
      // One superfamily. `display` is the same face at a heavier weight
      // and tighter tracking rather than a second typeface: revision
      // apps people rate — Amboss, Quizlet, Passmedicine — are sans
      // throughout, and let size and weight carry the hierarchy.
      fontFamily: {
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        // The editorial direction: reading and headings, and interface.
        serif: ["var(--font-serif)", "Georgia", "serif"],
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
      },
      /*
        The steps the product actually uses, named for the job rather
        than written out at the call site. Before this there were 137
        arbitrary sizes across the app, 95 of them the same 11px label,
        which is a scale nobody can see or change.

        Size only, no line-height. A Tailwind fontSize may carry one,
        and `text-xs` does — but these are dropped into rows, chips and
        paragraphs that set their own leading or inherit the body's,
        and a size that quietly re-sets line-height changes the layout
        of whatever it lands in. That is why `small` exists beside
        `xs` at the same 12px: same size, no opinion about leading.
      */
      fontSize: {
        micro: "10px", // the smallest chip, uppercase mono
        label: "11px", // mono labels beside a value
        small: "12px", // secondary UI text
        fine: "13px", // secondary prose, landing cards
        prose: "15px", // admin reading text
        reading: "17px", // the question itself
        figure: "30px", // a number meant to be read across the room
        title: "2.1rem", // the landing headline, narrow
        hero: "2.7rem", // the landing headline, wide
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
