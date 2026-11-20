import "server-only";
import { sendEmail, emailIsConfigured } from "@/lib/email";
import {
  RCOG_BASE,
  assessNice,
  assessRcog,
  isDue,
  isTog,
  kindOf,
  libraryEdition,
  parseNicePage,
  parseRcogPage,
  rcogListNumbers,
  rcogPageByTitle,
  type CheckResult,
  type GuidelineKind,
  type LibraryDoc,
} from "@/lib/guidelineCheck";
import { getLegalDetails } from "@/lib/legal";
import { readReplaced } from "@/lib/replacedDocuments";
import { readSetting, writeSetting } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";

/**
 * The guideline currency check (Admin > Guidelines), the server half: it
 * reads the RCOG's and NICE's own pages for every guideline in the
 * library other than TOG articles, records what each says, and keeps the
 * date of the last full check, so the page can say when the next is due.
 * Every 91 days the scheduled worker runs it and emails the owner what
 * has changed. Kept in app_settings; nothing in the library is altered.
 */

export const STATE_KEY = "guideline_checks";

export type ManualCheck = { checkedAt: string; note?: string };

export type GuidelineState = {
  ranAt: string | null;
  runningSince: string | null;
  results: Record<string, CheckResult>;
  manual: Record<string, ManualCheck>;
};

export type GuidelineDoc = LibraryDoc & {
  kind: GuidelineKind;
  number: string | null;
  section: string | null;
  official_url: string | null;
};

const EMPTY: GuidelineState = { ranAt: null, runningSince: null, results: {}, manual: {} };

export async function readGuidelineState(): Promise<GuidelineState> {
  const raw = await readSetting(STATE_KEY);
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<GuidelineState>) : {};
    return { ...EMPTY, ...parsed, results: parsed.results ?? {}, manual: parsed.manual ?? {} };
  } catch {
    return { ...EMPTY };
  }
}

async function writeState(state: GuidelineState) {
  return writeSetting(STATE_KEY, JSON.stringify(state));
}

/** Every guideline in the library other than TOG articles. */
export async function listGuidelineDocs(): Promise<GuidelineDoc[]> {
  const db = createAdminClient();
  type Row = LibraryDoc & { official_url: string | null; sections: { title: string } | null };
  const rows = (await fetchAll((from, to) =>
    db
      .from("content_documents")
      .select("id, title, source_reference, source_year, tog_year, tog_category, uploaded_at, official_url, sections(title)")
      .order("id")
      .range(from, to)
  )) as unknown as Row[];
  return rows
    .filter((d) => !isTog(d))
    .map((d) => ({ ...d, ...kindOf(d), section: d.sections?.title ?? null }));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; guideline currency check)" },
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks a few at a time, so neither site is hit by a hundred requests at once. */
async function inTurn<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await task(item);
      }
    })
  );
}

export type CheckSummary =
  | { ok: false; reason: string }
  | { ok: true; ranAt: string; checked: number; current: number; flagged: GuidelineDoc[]; errors: number; manual: number };

const LOCK_MS = 20 * 60_000;

export async function runGuidelineCheck(options: { notify?: boolean } = {}): Promise<CheckSummary> {
  const state = await readGuidelineState();
  if (state.runningSince && Date.now() - new Date(state.runningSince).getTime() < LOCK_MS) {
    return { ok: false, reason: "A check is already running." };
  }
  await writeState({ ...state, runningSince: new Date().toISOString() });

  try {
    const at = new Date().toISOString();
    const [docs, replaced] = await Promise.all([listGuidelineDocs(), readReplaced(true)]);
    const live = docs.filter((d) => !replaced[String(d.id)]);
    const results: Record<string, CheckResult> = {};

    // The RCOG's own lists of current guidance.
    const [gtgList, sipList] = await Promise.all([
      fetchText(`${RCOG_BASE}/green-top-guidelines/`),
      fetchText(`${RCOG_BASE}/scientific-impact-papers/`),
    ]);
    const gtg = gtgList ? rcogListNumbers(gtgList, "green-top-guidelines") : null;
    const sip = sipList ? rcogListNumbers(sipList, "scientific-impact-papers") : null;

    // The library copy's edition, where its first passage names it.
    const rcogDocs = live.filter((d) => d.kind === "rcog_gtg" || d.kind === "rcog_sip");
    const firstPassage = new Map<number, string>();
    if (rcogDocs.length) {
      const { data } = await createAdminClient()
        .from("content_chunks")
        .select("document_id, text")
        .in("document_id", rcogDocs.map((d) => d.id))
        .eq("chunk_index", 0);
      for (const c of data ?? []) firstPassage.set(c.document_id as number, c.text as string);
    }

    const pages = new Map<string, Promise<string | null>>();
    const page = (url: string) => {
      if (!pages.has(url)) pages.set(url, fetchText(url));
      return pages.get(url)!;
    };

    await inTurn(live.filter((d) => d.kind !== "other"), 6, async (doc) => {
      if (doc.kind === "rcog_gtg" || doc.kind === "rcog_sip") {
        const list = doc.kind === "rcog_gtg" ? gtg : sip;
        if (!list) {
          results[doc.id] = { status: "error", detail: "The RCOG's list of current guidance could not be read.", url: null, checkedAt: at };
          return;
        }
        const listHtml = doc.kind === "rcog_gtg" ? gtgList : sipList;
        const url =
          list.get(doc.number ?? "") ??
          (listHtml ? rcogPageByTitle(listHtml, doc.kind === "rcog_gtg" ? "green-top-guidelines" : "scientific-impact-papers", doc.title ?? "") : null);
        if (!url) {
          results[doc.id] = {
            status: "not_listed",
            detail: `No. ${doc.number} is not on the RCOG's list of current ${doc.kind === "rcog_gtg" ? "Green-top Guidelines" : "Scientific Impact Papers"}: it may have been archived or replaced.`,
            url: doc.kind === "rcog_gtg" ? `${RCOG_BASE}/green-top-guidelines/` : `${RCOG_BASE}/scientific-impact-papers/`,
            checkedAt: at,
          };
          return;
        }
        const html = await page(url);
        results[doc.id] = html
          ? assessRcog(doc, parseRcogPage(html), libraryEdition(firstPassage.get(doc.id) ?? ""), url, at)
          : { status: "error", detail: "The RCOG's page could not be read this time.", url, checkedAt: at };
        return;
      }
      if (doc.kind === "nice") {
        const url = `https://www.nice.org.uk/guidance/${(doc.number ?? "").toLowerCase()}`;
        const html = await page(url);
        results[doc.id] = html
          ? assessNice(doc, parseNicePage(html), url, at)
          : { status: "error", detail: "NICE's page could not be read this time.", url, checkedAt: at };
      }
    });

    const flagged = live.filter((d) => ["newer", "not_listed", "withdrawn"].includes(results[d.id]?.status ?? ""));
    const fresh = await readGuidelineState();
    await writeState({ ...fresh, ranAt: at, runningSince: null, results });

    const summary: CheckSummary = {
      ok: true,
      ranAt: at,
      checked: Object.keys(results).length,
      current: Object.values(results).filter((r) => r.status === "current").length,
      flagged,
      errors: Object.values(results).filter((r) => r.status === "error").length,
      manual: live.filter((d) => d.kind === "other").length,
    };
    if (options.notify) await emailOwner(summary, results);
    return summary;
  } catch (error) {
    const fresh = await readGuidelineState();
    await writeState({ ...fresh, runningSince: null });
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Called by the scheduled worker: runs the check only when 91 days have passed. */
export async function runGuidelineCheckIfDue(): Promise<void> {
  const state = await readGuidelineState();
  if (!isDue(state.ranAt)) return;
  await runGuidelineCheck({ notify: true });
}

export async function markChecked(ids: number[], note?: string): Promise<{ error?: string }> {
  const state = await readGuidelineState();
  const at = new Date().toISOString();
  for (const id of ids) state.manual[String(id)] = { checkedAt: at, ...(note ? { note: note.slice(0, 300) } : {}) };
  return writeState(state);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

async function emailOwner(summary: Extract<CheckSummary, { ok: true }>, results: Record<string, CheckResult>) {
  if (!emailIsConfigured()) return;
  const to = (await getLegalDetails()).legal_email;
  if (!to) return;
  const base = siteUrl();
  const lines = summary.flagged.map((d) => `${d.source_reference ?? ""}: ${d.title ?? ""}. ${results[d.id]?.detail ?? ""}`);
  const subject = summary.flagged.length
    ? `Pinard: ${summary.flagged.length} guideline${summary.flagged.length === 1 ? "" : "s"} may need updating`
    : "Pinard: guidelines checked, all current";
  const text = [
    `The quarterly guideline check ran on ${summary.ranAt.slice(0, 10)}.`,
    `${summary.checked} checked against the RCOG's and NICE's pages: ${summary.current} current, ${summary.flagged.length} to look at, ${summary.errors} could not be read.`,
    `${summary.manual} other guidelines (BSH, BASHH, FSRH and the rest) have no automatic check: mark them checked in Admin > Guidelines.`,
    ...(lines.length ? ["", "To look at:", ...lines.map((l) => `- ${l}`)] : []),
    "",
    `${base}/admin/guidelines`,
  ].join("\n");
  const html = `<p>The quarterly guideline check ran on ${summary.ranAt.slice(0, 10)}.</p><p>${summary.checked} checked against the RCOG's and NICE's pages: ${summary.current} current, ${summary.flagged.length} to look at, ${summary.errors} could not be read. ${summary.manual} other guidelines have no automatic check: mark them checked in Admin &gt; Guidelines.</p>${
    lines.length ? `<p>To look at:</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""
  }<p><a href="${base}/admin/guidelines">Open Admin &gt; Guidelines</a></p>`;
  await sendEmail({ to, subject, html, text });
}
