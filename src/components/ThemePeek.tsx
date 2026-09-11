"use client";

import { useEffect, useState } from "react";

/**
 * A switch for looking at the dark theme while it is being built.
 *
 * Development only. Dark mode is defined against the semantic roles but
 * is not yet reachable through prefers-color-scheme, because a screen
 * that has been migrated to the roles goes dark correctly and one that
 * still names porcelain does not — turning it on before the last screen
 * has moved would leave the site half lit.
 *
 * Which makes checking the work awkward: the only way to see a migrated
 * screen in the dark was to set an attribute by hand in the console, on
 * every screen, after every navigation. This sets it, remembers it, and
 * shows which screens still have further to go.
 *
 * It renders nothing in production, so it cannot become a feature
 * nobody decided to ship. The real toggle is the end of the migration,
 * not the beginning.
 */
export function ThemePeek() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("pinard-theme-peek");
    if (saved === "dark") {
      document.documentElement.dataset.theme = "dark";
      setTheme("dark");
    }
  }, []);

  if (process.env.NODE_ENV !== "development") return null;

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem("pinard-theme-peek", next);
    } catch {
      // A private window refusing storage is not a reason to fail.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Development only — dark mode is not live yet"
      className="fixed bottom-3 right-3 z-[60] rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink/70 shadow-card hover:text-ink-strong"
    >
      {theme === "dark" ? "☾ dark" : "☀ light"}
    </button>
  );
}
