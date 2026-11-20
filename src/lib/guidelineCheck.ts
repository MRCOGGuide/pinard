/**
 * Is a guideline in the library still the current edition? (Owner, 20
 * November 2026: "check the guidelines in the library (RCOG/NICE/other
 * guidelines other than TOG) and ensure they are not archived or replaced
 * with new guideline - so I can update it once there is new guidelines",
 * once every three months.)
 *
 * The pure half: which documents are checked and how, reading the RCOG's
 * and NICE's own pages, and what a page says about the library's copy.
 * No I/O, so it is tested against saved page snippets
 * (scripts/test-guidelines.mts); lib/guidelineCurrency does the fetching.
 */

export const CHECK_EVERY_DAYS = 91;

export type GuidelineKind = "rcog_gtg" | "rcog_sip" | "nice" | "other" | "tog";

export type CheckStatus =
  /** The official page shows nothing later than the library's copy. */
  | "current"
  /** The official page shows a later edition or update than the library's copy. */
  | "newer"
  /** No longer on the RCOG's list of current guidance: perhaps archived. */
  | "not_listed"
  /** The publisher says it is withdrawn or replaced. */
  | "withdrawn"
  /** The page could not be read this time. */
  | "error"
  /** No automatic check: an admin looks and marks it checked. */
  | "manual";

export type CheckResult = {
  status: CheckStatus;
  /** One plain line on what was found. */
  detail: string;
  /** The page that was read. */
  url: string | null;
  checkedAt: string;
};

export type LibraryDoc = {
  id: number;
  title: string | null;
  source_reference: string | null;
  source_year: number | null;
  tog_year: number | null;
  tog_category: string | null;
  uploaded_at: string | null;
};

const GTG = /\b(?:GTG|Green-?top Guideline)\s*(?:No\.?\s*)?(\d{1,3}[a-c]?)\b/i;
const SIP = /\b(?:SIP|Scientific Impact Paper)\s*(?:No\.?\s*)?(\d{1,3})\b/i;
const NICE_CODE = /\b(NG|CG|QS|TA|IPG|PH|DG|MTG|HTG|NM|ES)\s?(\d{1,4})\b/i;

export function isTog(doc: LibraryDoc): boolean {
  const ref = `${doc.source_reference ?? ""}`;
  return Boolean(doc.tog_year) || Boolean(doc.tog_category) || /10\.1111\/tog\./i.test(ref) || /^TOG\b/i.test(ref.trim());
}

export function kindOf(doc: LibraryDoc): { kind: GuidelineKind; number: string | null } {
  if (isTog(doc)) return { kind: "tog", number: null };
  const text = `${doc.source_reference ?? ""} ${doc.title ?? ""}`;
  if (/\bRCOG\b|Green-?top|Scientific Impact Paper/i.test(text)) {
    const g = text.match(GTG)?.[1];
    if (g) return { kind: "rcog_gtg", number: g.toLowerCase() };
    const s = text.match(SIP)?.[1];
    if (s) return { kind: "rcog_sip", number: s };
  }
  if (/\bNICE\b/i.test(doc.source_reference ?? "")) {
    const code = (doc.source_reference ?? "").match(NICE_CODE);
    if (code) return { kind: "nice", number: `${code[1].toUpperCase()}${code[2]}` };
  }
  return { kind: "other", number: null };
}

export const RCOG_BASE = "https://www.rcog.org.uk/guidance/browse-all-guidance";

/** The RCOG's current list page: guideline or paper number to its page. */
export function rcogListNumbers(html: string, kind: "green-top-guidelines" | "scientific-impact-papers"): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of html.matchAll(new RegExp(`/guidance/browse-all-guidance/${kind}/([a-z0-9+-]+)/`, "g"))) {
    const slug = m[1];
    const n = slug.match(/(?:-no-?|-sip-?|sip|-paper-)(\d+[a-c]?)(?:-|$)/)?.[1];
    if (n && !found.has(n)) found.set(n, `${RCOG_BASE}/${kind}/${slug}/`);
  }
  return found;
}

/**
 * A paper whose page address carries no number ("the-use-of-expanded-
 * carrier-screening-in-reproductive-medicine/"), found by its title.
 */
export function rcogPageByTitle(html: string, kind: "green-top-guidelines" | "scientific-impact-papers", title: string): string | null {
  const words = title
    .toLowerCase()
    .replace(/^summary of\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  if (words.length < 3) return null;
  const slug = words.join("-");
  const m = html.match(new RegExp(`/guidance/browse-all-guidance/${kind}/([a-z0-9+-]*${slug}[a-z0-9+-]*)/`));
  return m ? `${RCOG_BASE}/${kind}/${m[1]}/` : null;
}

function plainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

export type RcogPage = {
  /** "third", from "This is the third edition". */
  edition: string | null;
  /** The year the page's own edition was published, from its version history. */
  editionYear: number | null;
  /** Where the page gives no version history: years given for an update ("Update November 2026"). */
  years: number[];
  /** The latest review note: "reviewed 2025 – an update is in development". */
  review: string | null;
  /** "01 September 2026", from "last reviewed". */
  lastReviewed: string | null;
  archived: boolean;
  /** The sentence that gave the latest year, to show the owner. */
  latestNote: string | null;
};

const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

export function parseRcogPage(html: string): RcogPage {
  const text = plainText(html);
  const edition = text.match(/This is the (first|second|third|fourth|fifth|sixth) edition/i)?.[1]?.toLowerCase() ?? null;
  /*
    The RCOG's version history reads "This is the second edition of this
    guideline, published in 2015; reviewed 2018 – no update required;
    reviewed 2025 – an update is in development." The year after
    "published in" is the edition's; the review years are not editions.
  */
  const history = text.match(new RegExp(`This is the \\w+ edition of this (?:guideline|paper|guidance)[^.;]*?published in (?:${MONTH} )?((?:19|20)\\d{2})`, "i"));
  const editionYear = history ? Number(history[1]) : null;
  const reviews = [...text.matchAll(/reviewed (?:in )?((?:19|20)\d{2})\s*[–-]\s*([^;.]+)/gi)];
  const lastReview = reviews.at(-1);
  const notes: { year: number; sentence: string }[] = [];
  if (!history) {
    for (const m of text.matchAll(new RegExp(`[^.]*\\b(?:edition was published in|Update ${MONTH})[^.]*?\\b((?:19|20)\\d{2})\\b[^.]*\\.?`, "gi"))) {
      notes.push({ year: Number(m[1]), sentence: m[0].trim().slice(0, 200) });
    }
    notes.sort((a, b) => b.year - a.year);
  }
  return {
    edition,
    editionYear,
    years: [...new Set(notes.map((n) => n.year))],
    review: lastReview ? `reviewed ${lastReview[1]}: ${lastReview[2].trim()}` : null,
    lastReviewed: text.match(/last reviewed (\d{1,2} \w+ \d{4})/i)?.[1] ?? null,
    archived: /\bThis (?:guideline|paper|guidance) has been archived\b|\barchived guideline\b/i.test(text),
    latestNote: history ? history[0].trim().slice(0, 200) : notes[0]?.sentence ?? null,
  };
}

export type NicePage = {
  published: string | null;
  lastUpdated: string | null;
  withdrawn: boolean;
};

export function parseNicePage(html: string): NicePage {
  const flat = html.replace(/\s+/g, " ");
  const date = (label: string) =>
    flat.match(new RegExp(`${label}:(?:&nbsp;|\\s)*<time[^>]*datetime="(\\d{4}-\\d{2}-\\d{2})"`, "i"))?.[1] ?? null;
  const text = plainText(html);
  return {
    published: date("Published"),
    lastUpdated: date("Last updated"),
    withdrawn: /This guidance has been withdrawn|This guideline has been withdrawn|has been updated and replaced by|This guidance has been replaced by|This guideline has been replaced by/i.test(text),
  };
}

const ordinalIndex = (word: string | null) => (word ? ORDINALS.indexOf(word.toLowerCase()) : -1);

/** The library copy's edition, where its first passage says ("2nd Edition", "second edition"). */
export function libraryEdition(firstPassage: string): string | null {
  // Only the cover: further in, a passage tells the guideline's history ("the second edition was published in 2003").
  const t = firstPassage.replace(/\s+/g, " ").slice(0, 400);
  const n = t.match(/\b(\d)(?:st|nd|rd|th) Edition\b/i)?.[1];
  if (n) return ORDINALS[Number(n) - 1] ?? null;
  return t.match(/\bThis is the (first|second|third|fourth|fifth) edition/i)?.[1]?.toLowerCase() ?? null;
}

export function assessRcog(doc: LibraryDoc, page: RcogPage, libraryEditionWord: string | null, url: string, at: string): CheckResult {
  if (page.archived) return { status: "withdrawn", detail: "The RCOG's page says it has been archived.", url, checkedAt: at };
  const pageEdition = ordinalIndex(page.edition);
  const ours = ordinalIndex(libraryEditionWord);
  if (pageEdition >= 0 && ours >= 0 && pageEdition > ours) {
    return { status: "newer", detail: `The RCOG's page is the ${page.edition} edition; the library holds the ${libraryEditionWord}.`, url, checkedAt: at };
  }
  // The BJOG often dates an RCOG guideline a year before the RCOG does (GTG 52: 2016 and 2017).
  const sameEditionByYear = ours < 0 && page.editionYear && doc.source_year && page.editionYear - doc.source_year === 1;
  if (sameEditionByYear) {
    return {
      status: "current",
      detail: `The RCOG dates its ${page.edition ?? "current"} edition ${page.editionYear}; the library's copy says ${doc.source_year}, which is usually the same edition, published in the BJOG a year earlier.${page.review ? ` Last review: ${page.review}.` : ""}`,
      url,
      checkedAt: at,
    };
  }
  if (page.editionYear && doc.source_year && page.editionYear > doc.source_year) {
    return {
      status: "newer",
      detail: `The RCOG's page is the ${page.edition ?? "current"} edition, published in ${page.editionYear}; the library's copy is ${doc.source_year}.`,
      url,
      checkedAt: at,
    };
  }
  const latest = page.years[0] ?? null;
  if (!page.editionYear && latest && doc.source_year && latest > doc.source_year) {
    return {
      status: "newer",
      detail: `The RCOG's page gives ${latest} ("${page.latestNote ?? ""}"); the library's copy is ${doc.source_year}. Check whether this is a new edition or an update.`,
      url,
      checkedAt: at,
    };
  }
  const edition = page.edition ? ` The RCOG's page is the ${page.edition} edition${page.editionYear ? `, published in ${page.editionYear}` : ""}.` : "";
  const review = page.review ? ` Last review: ${page.review}.` : page.lastReviewed ? ` Page last reviewed ${page.lastReviewed}.` : "";
  return { status: "current", detail: `The library's copy is the current edition.${edition}${review}`, url, checkedAt: at };
}

export function assessNice(doc: LibraryDoc, page: NicePage, url: string, at: string): CheckResult {
  if (page.withdrawn) return { status: "withdrawn", detail: "NICE's page says it has been withdrawn or replaced.", url, checkedAt: at };
  const changed = page.lastUpdated ?? page.published;
  if (!changed) return { status: "error", detail: "NICE's page did not show its dates.", url, checkedAt: at };
  const uploaded = doc.uploaded_at ? doc.uploaded_at.slice(0, 10) : null;
  if (uploaded && changed > uploaded) {
    return { status: "newer", detail: `NICE last updated it on ${changed}, after the library's copy was uploaded on ${uploaded}.`, url, checkedAt: at };
  }
  return { status: "current", detail: `NICE last updated it on ${changed}; the library's copy was uploaded on ${uploaded ?? "an unknown date"}.`, url, checkedAt: at };
}

export function dueAt(lastRun: string | null): Date | null {
  if (!lastRun) return null;
  const d = new Date(lastRun);
  d.setDate(d.getDate() + CHECK_EVERY_DAYS);
  return d;
}

export function isDue(lastRun: string | null, now = new Date()): boolean {
  const due = dueAt(lastRun);
  return !due || due <= now;
}
