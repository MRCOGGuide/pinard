import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The primitives every screen is built from.
 *
 * Before this file the same class strings were written out by hand —
 * 70 cards, 23 primary buttons, 15 secondary — so a change to how a
 * card looks meant finding all 70, and any one of them could drift.
 * Everything visual lives here now; pages describe what a thing IS,
 * not what it looks like.
 */

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-card font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-good",
  secondary:
    "border border-line bg-surface text-ink/80 hover:border-good hover:text-ink-strong",
  quiet: "text-ink/60 hover:text-ink-strong",
  danger:
    "border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = ""
): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

/** A link that looks like a button. Same shape, different element. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

type Pad = "none" | "sm" | "md" | "lg";

const PAD: Record<Pad, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  pad = "lg",
  className = "",
  children,
  ...props
}: ComponentProps<"div"> & { pad?: Pad }) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card ${PAD[pad]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Typographic pieces                                                  */
/* ------------------------------------------------------------------ */

/** The small mono label above a block. Never a heading — a signpost. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-xs uppercase tracking-wide text-good ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-display text-lg font-semibold text-ink-strong ${className}`.trim()}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

type ChipTone = "neutral" | "good" | "warn" | "accent";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-line text-ink/60",
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  accent: "border-accent/40 bg-accent/10 text-accent",
};

export function Chip({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${CHIP_TONE[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Banner — a message about the page, not a heading on it              */
/* ------------------------------------------------------------------ */

type BannerTone = "info" | "good" | "warn";

const BANNER_TONE: Record<BannerTone, string> = {
  info: "border-line bg-surface text-ink/80",
  good: "border-good/40 bg-sunk text-good",
  warn: "border-accent/30 bg-accent/5 text-ink/80",
};

export function Banner({
  tone = "info",
  className = "",
  children,
}: {
  tone?: BannerTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-card border p-3 text-sm ${BANNER_TONE[tone]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export const FIELD_CLASS =
  "w-full rounded-card border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-good focus:outline-none focus:ring-1 focus:ring-good disabled:opacity-60";

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`.trim()}>
      <span className="block font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/55">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — says what to do, never just what is missing           */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <CardTitle>{title}</CardTitle>
      {children && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/70">
          {children}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pager — numbered pages, with the ends always reachable              */
/* ------------------------------------------------------------------ */

/**
 * The page numbers to show, with gaps where numbers are elided.
 *
 * First and last are always present so the ends of a long list stay one
 * click away, and the current page keeps a neighbour either side so the
 * row does not jump about as you move through it. A run of 1,200
 * questions at ten a page is 120 pages; showing them all would be its
 * own scrolling problem.
 */
export function pageWindow(
  current: number,
  total: number,
  span = 1
): (number | "gap")[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const wanted = new Set<number>([1, total]);
  for (let p = current - span; p <= current + span; p++) {
    if (p >= 1 && p <= total) wanted.add(p);
  }
  // With few enough pages there is nothing to elide, and a gap that
  // hides a single number is longer than the number.
  const pages = Array.from(wanted).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const p of pages) {
    if (previous && p - previous > 1) {
      if (p - previous === 2) out.push(previous + 1);
      else out.push("gap");
    }
    out.push(p);
    previous = p;
  }
  return out;
}

/** The page sizes every paged screen offers. One list, so the bank and
 *  the value review cannot drift apart. */
export const PAGE_SIZES = [5, 10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

export function Pager({
  page,
  pageCount,
  onPage,
  className = "",
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const step =
    "inline-flex min-w-8 items-center justify-center rounded-card border px-2.5 py-1 text-xs font-medium transition-colors";
  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-center gap-1 ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={`${step} border-line bg-surface text-ink/70 hover:text-ink-strong disabled:opacity-40 disabled:hover:text-ink/70`}
      >
        Previous
      </button>
      {pageWindow(page, pageCount).map((entry, i) =>
        entry === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-xs text-ink/40"
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onPage(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={`${step} ${
              entry === page
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink/70 hover:text-ink-strong"
            }`}
          >
            {entry}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        className={`${step} border-line bg-surface text-ink/70 hover:text-ink-strong disabled:opacity-40 disabled:hover:text-ink/70`}
      >
        Next
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Select — the same field, without 36 copies of its class string      */
/* ------------------------------------------------------------------ */

export function Select({
  label,
  hint,
  className = "",
  children,
  ...props
}: ComponentProps<"select"> & { label?: ReactNode; hint?: ReactNode }) {
  const select = (
    <select
      className={`${FIELD_CLASS} ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="block text-sm font-medium text-ink-strong">
      {label}
      {select}
      {hint && <span className="mt-1 block text-xs text-ink/55">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs — a filter that says how much is behind each choice            */
/* ------------------------------------------------------------------ */

export type TabOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Shown after the label. A filter that hides its size makes you
   *  click it to find out there was nothing there. */
  count?: number;
};

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex flex-wrap items-center gap-1 ${className}`.trim()}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-card border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink/70 hover:text-ink-strong"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={selected ? "opacity-80" : "opacity-60"}>
                {" "}
                ({option.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
