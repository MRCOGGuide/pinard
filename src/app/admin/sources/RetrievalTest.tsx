"use client";

import { Fragment, useState, useTransition } from "react";
import type { SectionOption } from "@/lib/sections";
import type { RetrievedChunk } from "@/lib/retrieval";
import { testRetrieval } from "./actions";

// Content words from the query, used to locate and highlight the
// matching region of each chunk (skips short stop-words).
const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "and", "or", "is", "are",
  "what", "which", "how", "for", "with", "within", "at", "by", "from",
  "risk", "does", "do", "was", "were", "be", "that", "this", "it",
]);

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s%]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    )
  );
}

/** A snippet centred on the densest cluster of query terms, with terms bolded. */
function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const lower = text.toLowerCase();

  // Find the window (±280 chars) containing the most term hits.
  let bestStart = 0;
  let bestHits = -1;
  const step = 120;
  for (let start = 0; start < Math.max(1, text.length - 1); start += step) {
    const windowText = lower.slice(start, start + 560);
    const hits = terms.reduce(
      (n, t) => n + (windowText.includes(t) ? 1 : 0),
      0
    );
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = start;
    }
  }

  const from = Math.max(0, bestStart - 40);
  const to = Math.min(text.length, from + 560);
  const slice = text.slice(from, to);

  // Highlight term occurrences within the slice.
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = terms.length ? slice.split(pattern) : [slice];

  return (
    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite/90">
      {from > 0 && "… "}
      {parts.map((part, i) =>
        terms.some((t) => t === part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-heartbeat/15 px-0.5 text-graphite">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
      {to < text.length && " …"}
    </p>
  );
}

export function RetrievalTest({ options }: { options: SectionOption[] }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [results, setResults] = useState<RetrievedChunk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = query;
    startTransition(async () => {
      const outcome = await testRetrieval(q, sectionId);
      if (outcome.error) {
        setError(outcome.error);
        setResults(null);
        return;
      }
      setError(null);
      setSubmittedQuery(q);
      setResults(outcome.results ?? []);
    });
  }

  const terms = queryTerms(submittedQuery);

  return (
    <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. What is the risk of recurrence of OASI?"
          className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-2 text-sm"
        />
        <select
          value={sectionId ?? ""}
          onChange={(e) =>
            setSectionId(e.target.value ? Number(e.target.value) : null)
          }
          className="rounded-card border border-hairline bg-white px-2 py-2 text-sm"
        >
          <option value="">All sections</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !query.trim()}
          className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-50"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {results && results.length === 0 && (
        <p className="mt-3 text-sm text-graphite/60">
          No passages found. Has a document in this section been ingested?
        </p>
      )}

      {results && results.length > 0 && (
        <ol className="mt-4 space-y-3">
          {results.map((r, i) => (
            <li
              key={r.chunk_id}
              className="rounded-card border border-hairline bg-white/60 p-3"
            >
              <p className="font-mono text-[11px] text-graphite/60">
                #{i + 1} · chunk:{r.chunk_id} · similarity{" "}
                {(r.similarity * 100).toFixed(1)}% · {r.document_title} ·{" "}
                {r.source_reference}
              </p>
              <Snippet text={r.text} terms={terms} />
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-greentop">
                  Show full chunk
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite/80">
                  {r.text}
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
