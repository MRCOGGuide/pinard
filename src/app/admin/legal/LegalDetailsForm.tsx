"use client";

import { useState, useTransition } from "react";
import { Button, Field, FIELD_CLASS, Toast } from "@/components/ui";
import { LEGAL_FIELDS, type LegalDetails } from "@/lib/legalShared";
import { saveDetails } from "./actions";

/**
 * Who the customer is contracting with. Every legal page quotes these,
 * so they are entered once here rather than typed into five pages.
 */
export function LegalDetailsForm({ details }: { details: LegalDetails }) {
  const [values, setValues] = useState<Record<string, string>>({ ...details });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const result = await saveDetails(values);
      setMsg(
        result.error
          ? { ok: false, text: result.error }
          : { ok: true, text: "Saved. Every legal page now shows these details." }
      );
    });
  }

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Legal details</h2>
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          {LEGAL_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} className={f.multiline ? "sm:col-span-2" : ""}>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className={`mt-1 ${FIELD_CLASS}`}
                />
              ) : (
                <input
                  type={f.key === "legal_email" ? "email" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className={`mt-1 ${FIELD_CLASS}`}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
          {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
        </div>
      </div>
    </section>
  );
}
