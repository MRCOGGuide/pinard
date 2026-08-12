"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  GLOBAL_SECTION_ID,
  GLOBAL_SECTION_LABEL,
  type SectionOption,
} from "@/lib/sections";

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

type Totals = {
  sba: number;
  emqGroups: number;
  emqScenarios: number;
  unsourced: number;
};

type PartResult = {
  ok?: boolean;
  error?: string;
  nextCursor: number | null;
  totalParts: number;
  sba?: number;
  emqGroups?: number;
  emqScenarios?: number;
  unsourced?: number;
  skipped?: string[];
};

/**
 * Import a large question book (200–300 pages): the PDF is uploaded to
 * storage first (no request-size cap), then processed part by part so
 * each server call stays within platform limits. Resumable on error.
 */
export function BookImportPanel({ options }: { options: SectionOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState<number>(GLOBAL_SECTION_ID);
  const [sourceNote, setSourceNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [done, setDone] = useState(false);
  // Kept for resuming a failed run without re-uploading.
  const [resume, setResume] = useState<{ path: string; cursor: number } | null>(
    null
  );

  async function processFrom(path: string, startCursor: number) {
    setBusy(true);
    setError(null);
    setDone(false);
    const sums: Totals = totals ?? {
      sba: 0,
      emqGroups: 0,
      emqScenarios: 0,
      unsourced: 0,
    };

    let cursor: number | null = startCursor;
    try {
      while (cursor !== null) {
        setProgress(`Processing part ${cursor + 1}…`);
        const response = await fetch("/api/examples/import-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, sectionId, sourceNote, cursor }),
        });
        const bodyText = await response.text();
        const lastLine = bodyText.trim().split("\n").pop() ?? "";
        let payload: PartResult;
        try {
          payload = JSON.parse(lastLine);
        } catch {
          payload = {
            error: `Import failed (HTTP ${response.status})`,
            nextCursor: cursor,
            totalParts: 0,
          };
        }
        if (payload.error) {
          setError(`Part ${cursor + 1}: ${payload.error}`);
          setResume({ path, cursor });
          setTotals(sums);
          return;
        }
        sums.sba += payload.sba ?? 0;
        sums.emqGroups += payload.emqGroups ?? 0;
        sums.emqScenarios += payload.emqScenarios ?? 0;
        sums.unsourced += payload.unsourced ?? 0;
        setTotals({ ...sums });
        setProgress(
          `Part ${cursor + 1} of ${payload.totalParts} done — ${sums.sba} SBAs, ${sums.emqGroups} EMQ sets so far.`
        );
        cursor = payload.nextCursor;
      }

      // Finished — remove the temporary stored file.
      const supabase = createClient();
      await supabase.storage.from("sources").remove([path]);
      setResume(null);
      setDone(true);
      setProgress(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setTotals(null);
    setDone(false);

    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF file first");
      return;
    }

    setBusy(true);
    setProgress("Uploading the book…");
    const supabase = createClient();
    const path = `examples/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("sources")
      .upload(path, file, { contentType: "application/pdf" });
    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setBusy(false);
      setProgress(null);
      return;
    }
    if (fileInput.current) fileInput.current.value = "";
    await processFrom(path, 0);
  }

  return (
    <div className="mb-5 rounded-card border border-hairline bg-porcelain shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="font-display text-base font-semibold text-theatre">
          Import a question book{" "}
          <span className="font-sans text-xs font-normal text-graphite/55">
            — hundreds of pages, any size
          </span>
        </span>
        <span className="font-mono text-xs text-greentop">
          {open ? "− close" : "+ open"}
        </span>
      </button>

      {open && (
        <form onSubmit={start} className="border-t border-hairline p-5">
          <p className="text-xs leading-relaxed text-graphite/60">
            For revision books of SBA/EMQ questions with answers at the end
            of each section — hundreds of pages are fine. The book is
            processed in parts; answers are matched to their questions by
            number and{" "}
            <strong className="text-theatre">
              verified against the book&rsquo;s own text
            </strong>
            . A question whose answer key can&rsquo;t be found is skipped,
            never guessed. Duplicates across part boundaries are removed
            automatically.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Section
              <select
                value={sectionId}
                onChange={(e) => setSectionId(Number(e.target.value))}
                className={field}
              >
                <option value={GLOBAL_SECTION_ID}>
                  {GLOBAL_SECTION_LABEL}
                </option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Source note
              <input
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="SBAs for MRCOG Part 2 (book)"
                className={field}
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium">
            PDF file
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="mt-1 block w-full text-sm text-graphite/70 file:mr-3 file:rounded-card file:border file:border-hairline file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-theatre"
            />
          </label>

          {progress && (
            <p className="mt-3 text-xs text-graphite/60">
              {progress} Leave this page open — a full book can take a while.
            </p>
          )}
          {error && (
            <div className="mt-3 text-sm text-heartbeat">
              <p>{error}</p>
              {resume && (
                <button
                  type="button"
                  onClick={() => processFrom(resume.path, resume.cursor)}
                  disabled={busy}
                  className="mt-2 rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/80 hover:text-theatre disabled:opacity-60"
                >
                  Resume from part {resume.cursor + 1}
                </button>
              )}
            </div>
          )}
          {done && totals && (
            <div className="mt-3 rounded-card border border-greentop/40 bg-white/60 p-3 text-sm">
              <p className="font-medium text-greentop">
                Book imported: {totals.sba} SBAs
                {totals.emqScenarios > 0 &&
                  ` and ${totals.emqGroups} EMQ sets (${totals.emqScenarios} scenarios)`}{" "}
                — review them in the list below.
              </p>
              {totals.unsourced > 0 && (
                <p className="mt-1 text-xs text-graphite/70">
                  {totals.unsourced} question
                  {totals.unsourced === 1 ? " was" : "s were"} skipped
                  because their answer key couldn&rsquo;t be located in the
                  text — none were guessed.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import book"}
          </button>
        </form>
      )}
    </div>
  );
}
