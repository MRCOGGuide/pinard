"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button, CardTitle } from "./index";

/* ------------------------------------------------------------------ */
/* Confirm — for the eight places that called window.confirm           */
/* ------------------------------------------------------------------ */

/**
 * window.confirm is the one stock gesture left in the product: it looks
 * like the browser rather than like Pinard, it cannot say what is about
 * to happen in more than one line, and it gives a destructive action
 * the same weight as a cancel.
 *
 * This says what will be lost, names the count in the button, and
 * styles the destructive choice as destructive. Escape and the backdrop
 * both cancel, because the safe outcome should be the easy one.
 */
export function Confirm({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-ink/40"
      />
      <div className="relative w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-card">
        <CardTitle>{title}</CardTitle>
        {children && (
          <div className="mt-2 text-sm leading-relaxed text-ink/75">{children}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
