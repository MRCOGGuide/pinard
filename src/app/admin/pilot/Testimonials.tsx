"use client";

import { useState, useTransition } from "react";
import { Button, FIELD_CLASS, Toast } from "@/components/ui";
import type { Testimonial } from "@/lib/offer";
import { saveQuotes } from "./actions";

/**
 * The sentences the cohort gives you, typed in as they said them.
 *
 * Empty until somebody has said something: the landing page shows no
 * section at all rather than a placeholder, because an invented
 * testimonial is a lie about a person and this product's whole
 * argument is that it does not make things up.
 */
export function Testimonials({ initial }: { initial: Testimonial[] }) {
  const [rows, setRows] = useState<Testimonial[]>(
    initial.length ? initial : [{ quote: "", name: "", detail: "" }]
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set(i: number, field: keyof Testimonial, value: string) {
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [field]: value } : row)));
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">
        Testimonials
      </h2>
      <p className="mb-3 text-sm text-ink/60">
        One sentence and who said it. The landing page shows this section
        only when there is something in it, so an empty list is a page
        with no testimonials rather than a page with empty quote marks.
      </p>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <textarea
              rows={2}
              value={row.quote}
              onChange={(e) => set(i, "quote", e.target.value)}
              placeholder="What they said, in their words."
              className={FIELD_CLASS}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) => set(i, "name", e.target.value)}
                placeholder="Name, or initials"
                className={FIELD_CLASS}
              />
              <input
                type="text"
                value={row.detail}
                onChange={(e) => set(i, "detail", e.target.value)}
                placeholder="ST6, Leeds · passed November 2026"
                className={FIELD_CLASS}
              />
            </div>
            {rows.length > 1 && (
              <Button
                size="sm"
                variant="quiet"
                className="mt-2"
                onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setRows((r) => [...r, { quote: "", name: "", detail: "" }])
          }
        >
          Add another
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const keep = rows.filter(
                (r) => r.quote.trim() && r.name.trim()
              );
              const result = await saveQuotes(keep);
              setMsg(
                result.error
                  ? { ok: false, text: result.error }
                  : {
                      ok: true,
                      text: keep.length
                        ? `Saved. ${keep.length} on the landing page.`
                        : "Saved. The section is hidden while it is empty.",
                    }
              );
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
      </div>
    </section>
  );
}
