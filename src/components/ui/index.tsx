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
  primary: "bg-theatre text-porcelain hover:bg-greentop",
  secondary:
    "border border-hairline bg-porcelain text-graphite/80 hover:border-greentop hover:text-theatre",
  quiet: "text-graphite/60 hover:text-theatre",
  danger:
    "border border-heartbeat/40 bg-heartbeat/10 text-heartbeat hover:bg-heartbeat/15",
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
      className={`rounded-card border border-hairline bg-porcelain shadow-card ${PAD[pad]} ${className}`.trim()}
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
      className={`font-mono text-xs uppercase tracking-wide text-greentop ${className}`.trim()}
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
      className={`font-display text-lg font-semibold text-theatre ${className}`.trim()}
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
  neutral: "border-hairline text-graphite/60",
  good: "border-greentop/40 bg-greentop/10 text-greentop",
  warn: "border-amber/40 bg-amber/10 text-amber",
  accent: "border-heartbeat/40 bg-heartbeat/10 text-heartbeat",
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
  info: "border-hairline bg-porcelain text-graphite/80",
  good: "border-greentop/40 bg-sage text-greentop",
  warn: "border-heartbeat/30 bg-heartbeat/5 text-graphite/80",
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
  "w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm text-graphite placeholder:text-graphite/40 focus:border-greentop focus:outline-none focus:ring-1 focus:ring-greentop disabled:opacity-60";

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
      <span className="block font-medium text-graphite/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-graphite/55">{hint}</span>}
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
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-graphite/70">
          {children}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </Card>
  );
}
