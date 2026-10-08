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
      /*
        Two faces (docs/design/DIRECTION.md). `serif` is Newsreader, for
        headings and clinical reading; `ui` is Source Sans 3, for
        everything pressed or scanned. The older names map onto them so
        nothing has to be renamed at the call site: `display` is the
        heading face, `sans` the interface, and `mono` is the interface
        with tabular figures (globals.css), there being no monospace.
      */
      fontFamily: {
        serif: ["var(--font-serif)", "Newsreader Fallback", "Georgia", "serif"],
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        display: ["var(--font-serif)", "Newsreader Fallback", "Georgia", "serif"],
        sans: ["var(--font-ui)", "system-ui", "sans-serif"],
        mono: ["var(--font-ui)", "system-ui", "sans-serif"],
      },
      /*
        The type scale, named for the job. Size only, no line-height: a
        size that quietly re-sets leading changes the layout of whatever
        it lands in.

        Nothing below 11px. The old scale went to 10 for uppercase mono
        chips; with the capitals gone the small sizes moved up a step so
        sentence-case labels stay legible on a phone.
      */
      fontSize: {
        micro: "11px", // the smallest chip
        label: "12px", // a label beside a value
        small: "13px", // secondary UI text
        fine: "14px", // secondary prose
        prose: "16px", // admin reading text
        reading: "18px", // the question itself (see .reading)
        figure: "30px", // a number meant to be read across the room
        title: "2.25rem", // the landing headline, narrow
        hero: "2.875rem", // the landing headline, wide
      },
      letterSpacing: {
        display: "-0.012em",
      },
      /* Two radii: a card, and a control (button, field, option). */
      borderRadius: {
        card: "12px",
        control: "10px",
      },
      /* Two heights of shadow: resting, and lifted under the pointer or
         over the page (a dialog). Boxes are for pressable things; most
         content sits on rules, not in cards. */
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04)",
        raised: "0 12px 32px rgb(0 0 0 / 0.10)",
      },
      /* Motion. Everything responds in 150 to 250ms, eased out, and only
         transform and opacity move (docs/design/DIRECTION.md). */
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "250ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      },
      spacing: {
        gutter: "1rem", // the page's side margin on a phone
        section: "3.5rem", // between sections of a page
      },
      maxWidth: {
        question: "720px",
      },
    },
  },
  plugins: [],
};
export default config;
