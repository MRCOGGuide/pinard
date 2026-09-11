"use client";

import { useEffect, useState } from "react";

/**
 * Light, dark, or whatever the device says.
 *
 * The choice is resolved to a concrete theme by a script in the head
 * before anything paints (see layout.tsx), which is why this component
 * never has to guess: by the time it mounts, data-theme is already
 * right and it only has to read it back. Resolving there rather than
 * here is also what keeps the dark palette in one block of CSS instead
 * of two — a media query would need its own copy of every value, and
 * two copies of a palette drift.
 */

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "pinard-theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const LABEL: Record<ThemeChoice, string> = {
  system: "Match my device",
  light: "Light",
  dark: "Dark",
};

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) as ThemeChoice | null;
    setChoice(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  // On "system", follow the device if it changes while the page is open.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function cycle() {
    const next = NEXT[choice ?? "system"];
    setChoice(next);
    apply(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // A browser refusing storage is not a reason to fail; the choice
      // simply lasts until the page is left.
    }
  }

  // Nothing until the stored choice is known. Rendering a guess first
  // would show the wrong icon for a frame on every load.
  if (choice === null) {
    return <span className={`inline-block h-8 w-8 ${className}`.trim()} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Appearance: ${LABEL[choice]}. Click to change.`}
      aria-label={`Appearance: ${LABEL[choice]}. Click to change.`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-card text-ink/60 transition-colors hover:text-ink-strong ${className}`.trim()}
    >
      <Icon choice={choice} />
    </button>
  );
}

/** Sun, moon, or half of each for "follow the device". 1.5px strokes,
 *  matching the icons already in the journey rail. */
function Icon({ choice }: { choice: ThemeChoice }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      {choice === "light" && (
        <>
          <circle cx="12" cy="12" r="4.2" {...stroke} />
          <path
            d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
            {...stroke}
          />
        </>
      )}
      {choice === "dark" && (
        <path d="M20 14.2A8.2 8.2 0 019.8 4a8.2 8.2 0 1010.2 10.2z" {...stroke} />
      )}
      {choice === "system" && (
        <>
          <circle cx="12" cy="12" r="8" {...stroke} />
          {/* The half that is filled says which way the device is set. */}
          <path d="M12 4a8 8 0 000 16z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
