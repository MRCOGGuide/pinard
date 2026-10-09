"use client";

import { useState, useTransition } from "react";
import { Button, FIELD_CLASS, Toast } from "@/components/ui";
import { Confirm } from "@/components/ui/Confirm";
import { LegalDocument } from "@/components/LegalDocument";
import { legalValues, LEGAL_FIELDS, type LegalDetails, type LegalDocKey } from "@/lib/legalShared";
import { restorePage, savePage } from "./actions";

type Page = {
  key: LegalDocKey;
  title: string;
  href: string;
  body: string;
  updated: string;
  edited: boolean;
  defaultBody: string;
};

/**
 * The wording of each legal page, editable, with a preview that renders
 * exactly as the public page will. The format is plain text (see the
 * help under the editor), never HTML.
 */
export function LegalPagesEditor({
  pages,
  figures,
  details,
}: {
  pages: Page[];
  figures: Record<string, string>;
  details: LegalDetails;
}) {
  const [active, setActive] = useState<LegalDocKey>(pages[0].key);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(pages.map((p) => [p.key, p.body]))
  );
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const page = pages.find((p) => p.key === active)!;
  const draft = drafts[active];
  const changed = draft !== page.body;

  function save() {
    setMsg(null);
    startTransition(async () => {
      const result = await savePage(active, draft);
      setMsg(result.error ? { ok: false, text: result.error } : { ok: true, text: "Saved. The public page shows it now, dated today." });
    });
  }

  function restore() {
    setConfirming(false);
    setMsg(null);
    startTransition(async () => {
      const result = await restorePage(active);
      if (!result.error) setDrafts({ ...drafts, [active]: page.defaultBody });
      setMsg(result.error ? { ok: false, text: result.error } : { ok: true, text: "Restored to the default wording." });
    });
  }

  const tokens = ["trading_name", ...LEGAL_FIELDS.map((f) => f.token).filter((t) => t !== "trading_name"), "registration", ...Object.keys(figures)];

  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Legal pages</h2>

      <div role="tablist" aria-label="Legal pages" className="mb-4 flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === active}
            onClick={() => {
              setActive(p.key);
              setMsg(null);
            }}
            className={`rounded-full border px-3 py-1.5 font-ui text-[14px] font-semibold ${
              p.key === active ? "border-good bg-good/10 text-ink-strong" : "border-line text-ink/70 hover:text-ink-strong"
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 font-ui text-[14px] text-ink/70">
          <span>
            {page.edited ? `Your wording, last saved ${page.updated}.` : "The default wording, not yet edited."}{" "}
            <a href={page.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-good underline underline-offset-2">
              Open the public page
            </a>
          </span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} className="h-4 w-4 accent-good" />
            Preview
          </label>
        </div>

        {preview ? (
          <div className="max-h-[70vh] overflow-y-auto rounded-control border border-line bg-ground p-5">
            <LegalDocument source={draft} values={legalValues(details, figures)} />
          </div>
        ) : (
          <textarea
            aria-label={`${page.title} wording`}
            value={draft}
            onChange={(e) => setDrafts({ ...drafts, [active]: e.target.value })}
            rows={28}
            spellCheck
            className={`${FIELD_CLASS} font-mono text-[13px] leading-relaxed`}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !changed}>
            {pending ? "Saving…" : "Save page"}
          </Button>
          {changed && (
            <Button variant="quiet" onClick={() => setDrafts({ ...drafts, [active]: page.body })} disabled={pending}>
              Discard changes
            </Button>
          )}
          {page.edited && (
            <Button variant="secondary" onClick={() => setConfirming(true)} disabled={pending}>
              Restore the default
            </Button>
          )}
          {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
        </div>

        <Confirm
          open={confirming}
          title="Restore the default wording?"
          confirmLabel="Restore"
          destructive
          busy={pending}
          onConfirm={restore}
          onCancel={() => setConfirming(false)}
        >
          Your edits to this page will be replaced by the wording in the code.
        </Confirm>

        <details className="mt-5 font-ui text-[14px] text-ink/75">
          <summary className="cursor-pointer font-semibold text-ink-strong">How to format the text</summary>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li><code>## Heading</code> starts a section; <code>### Heading</code> a sub-heading.</li>
            <li>A line starting <code>- </code> is a bullet point.</li>
            <li>A blank line starts a new paragraph.</li>
            <li><code>**words**</code> are bold; <code>[words](/privacy)</code> is a link (to a page here, an https:// address or a mailto:).</li>
            <li>A line starting <code>&gt; </code> is a highlighted note.</li>
            <li>Table rows look like <code>| one | two |</code>; the first row is the header.</li>
            <li>
              These fill in from your details and the app:{" "}
              {tokens.map((t, i) => (
                <span key={t}>
                  {i > 0 && ", "}
                  <code>{`{{${t}}}`}</code>
                </span>
              ))}
              .
            </li>
          </ul>
        </details>
      </div>
    </section>
  );
}
