/**
 * Admin > Guidelines: which documents are checked and how, reading the
 * RCOG's and NICE's pages, what a page says about the library's copy, and
 * when the next check is due. Offline: saved snippets shaped like the
 * real pages (read 20 November 2026), no fetches.
 *
 *   npx tsx --conditions=react-server scripts/test-guidelines.mts
 */
const g = await import("../src/lib/guidelineCheck");

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const doc = (over: Partial<Parameters<typeof g.kindOf>[0]>) => ({
  id: 1, title: "", source_reference: "", source_year: null, tog_year: null, tog_category: null, uploaded_at: "2026-01-10T00:00:00Z", ...over,
});

// Which documents, and how.
check("an RCOG Green-top Guideline is checked by its number", g.kindOf(doc({ source_reference: "RCOG GTG No. 42", title: "Shoulder Dystocia" })).number === "42");
check("37a keeps its letter", g.kindOf(doc({ source_reference: "RCOG GTG No. 37a" })).number === "37a");
check("a Scientific Impact Paper", g.kindOf(doc({ source_reference: "RCOG Scientific Impact Paper No. 80, October 2026" })).kind === "rcog_sip");
check("a NICE guideline by its code", g.kindOf(doc({ source_reference: "NICE NG 23 (April 2026 update)" })).number === "NG23");
check("a TOG article is left out", g.kindOf(doc({ source_reference: "https://doi.org/10.1111/tog.12947", title: "Surgical techniques" })).kind === "tog");
check("a TOG issue is left out", g.kindOf(doc({ source_reference: "TOG", tog_year: 2024 })).kind === "tog");
check("BASHH and the rest are checked by hand", g.kindOf(doc({ source_reference: "BASHH 2018", title: "Gonorrhoea" })).kind === "other");
check("an RCOG paper with no number is checked by hand", g.kindOf(doc({ source_reference: "RCOG Good Practice Paper", title: "Better for women" })).kind === "other");

// The RCOG's list and pages.
const list = `<a href="/guidance/browse-all-guidance/green-top-guidelines/shoulder-dystocia-green-top-guideline-no-42/">Shoulder Dystocia (No. 42)</a>
<a href="/guidance/browse-all-guidance/green-top-guidelines/reducing-the-risk-of-thrombosis-and-embolism-during-pregnancy-and-the-puerperium-green-top-guideline-no-37a/">x</a>`;
const numbers = g.rcogListNumbers(list, "green-top-guidelines");
check("the RCOG list gives each number its page", numbers.get("42")?.endsWith("shoulder-dystocia-green-top-guideline-no-42/") === true && numbers.has("37a"));

const page = `<div><p>This is the third edition of this guideline. The first edition was published in 2005 under the same title and the second edition was published in 2012.</p>
<p><strong>Update November 2026: </strong>The NIHR Patient Safety Research Collaboration ...</p><p class="page-meta">This page was last reviewed 01 September 2026.</p></div>`;
const parsed = g.parseRcogPage(page);
check("the page's edition is read", parsed.edition === "third");
check("the page's latest year is read", parsed.years[0] === 2026, parsed.years.join(","));
check("the page's review date is read", parsed.lastReviewed === "01 September 2026");
check("the library copy's edition is read from its first passage", g.libraryEdition("Shoulder Dystocia Green–top Guideline No. 42 2nd Edition I March 2012") === "second");

const at = "2026-11-20T10:00:00Z";
const old = g.assessRcog(doc({ source_year: 2012 }), parsed, "second", "u", at);
check("a 2012 second edition against a third: newer", old.status === "newer", old.detail);
const fresh = g.assessRcog(doc({ source_year: 2026 }), parsed, "third", "u", at);
check("the 2026 third edition: current", fresh.status === "current", fresh.detail);
const history = g.parseRcogPage("<p>Version history This is the second edition of this guideline, published in 2015; reviewed 2018 – no update required; reviewed 2025 – an update is in development.</p>");
check("the version history gives the edition's own year", history.editionYear === 2015 && history.edition === "second");
check("review years are not editions", g.assessRcog(doc({ source_year: 2015 }), history, null, "u", at).status === "current");
check("the latest review note is shown", (g.assessRcog(doc({ source_year: 2015 }), history, null, "u", at).detail).includes("reviewed 2025: an update is in development"));
const third = g.parseRcogPage("<p>This is the third edition of this guideline, published in 2025.</p>");
// GTG 51: the RCOG's "2024 Partial Update" is the third edition the BJOG dates 2025, so the library's 2024 copy is current.
check("the 2024 partial update against the 2025-dated third edition: current", g.assessRcog(doc({ source_year: 2024 }), third, null, "u", at).status === "current");
check("a second edition against the RCOG's third: newer", g.assessRcog(doc({ source_year: 2016 }), third, "second", "u", at).status === "newer");
check("an edition more than a year newer: newer", g.assessRcog(doc({ source_year: 2020 }), third, null, "u", at).status === "newer");
check("\"published in October 2021\" is read", g.parseRcogPage("<p>This is the fifth edition of this guideline, published in October 2021; reviewed 2024 – no update required.</p>").editionYear === 2021);
check("the BJOG's year one before the RCOG's: the same edition", g.assessRcog(doc({ source_year: 2016 }), g.parseRcogPage("<p>This is the second edition of this guideline, published in 2017; reviewed in 2023 – an update is in development.</p>"), null, "u", at).status === "current");
check("the library's edition is read from the cover only", g.libraryEdition(`Green-top Guideline No. 34 July 2016 Minor Update December 2025 ${"x ".repeat(250)} the 2nd edition was published in 2003`) === null);
check(
  "a paper found by its title where its address has no number",
  g.rcogPageByTitle('<a href="/guidance/browse-all-guidance/scientific-impact-papers/the-use-of-expanded-carrier-screening-in-reproductive-medicine/">x</a>', "scientific-impact-papers", "The Use of Expanded Carrier Screening in Reproductive Medicine")?.endsWith("reproductive-medicine/") === true
);
check("an archived page is withdrawn", g.assessRcog(doc({ source_year: 2020 }), g.parseRcogPage("<p>This guideline has been archived.</p>"), null, "u", at).status === "withdrawn");

// NICE's pages.
const nice = `<li>Published:&nbsp; <time class="show" datetime="2015-11-20"> 20 November 2015 </time></li>
<li>Last updated:&nbsp; <time class="show" datetime="2022-06-10"> 10 June 2022 </time></li>`;
const np = g.parseNicePage(nice);
check("NICE's dates are read", np.published === "2015-11-20" && np.lastUpdated === "2022-06-10");
check("updated after the copy was uploaded: newer", g.assessNice(doc({ uploaded_at: "2022-01-01T00:00:00Z" }), np, "u", at).status === "newer");
check("uploaded after the last update: current", g.assessNice(doc({ uploaded_at: "2026-03-01T00:00:00Z" }), np, "u", at).status === "current");
check("\"This guideline replaces CG154\" is not a withdrawal", !g.parseNicePage(`${nice}<p>This guideline replaces CG154.</p>`).withdrawn);
check("a withdrawn NICE guideline", g.parseNicePage("<p>This guidance has been withdrawn.</p>").withdrawn);

// When.
check("never checked: due", g.isDue(null));
check("checked 30 days ago: not due", !g.isDue(new Date(Date.now() - 30 * 864e5).toISOString()));
check("checked 92 days ago: due", g.isDue(new Date(Date.now() - 92 * 864e5).toISOString()));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
