/**
 * The official page of a source (L7.3; owner, 18 November 2026: answers
 * show where their information came from, as the AI search tools do,
 * which name what they cite and link to it).
 *
 * A link set in Admin > Sources wins. Otherwise one is worked out where
 * the reference already gives it: a DOI resolves to the journal's own
 * page, and a NICE code to the guidance on nice.org.uk. Anything else
 * has no link until an admin gives it one, rather than a guessed one.
 *
 * Pure, no I/O: imported by the server and the cards alike.
 */

const DOI = /\b(10\.\d{4,9}\/[^\s"<>;,)]+)/i;
const NICE_CODE = /\b(NG|CG|QS|TA|IPG|PH|DG|MTG|HTG|NM|ES)\s?(\d{1,4})\b/;

/** Only an https address, without spaces, is ever used as a link. */
export function safeLink(url: string | null | undefined): string | null {
  const value = (url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/.test(value)) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** A link worked out from the reference alone, or null. */
export function derivedOfficialUrl(reference: string | null | undefined, title: string | null | undefined = ""): string | null {
  const text = `${reference ?? ""} ${title ?? ""}`;
  const doi = text.match(DOI)?.[1]?.replace(/[.]+$/, "");
  if (doi) return `https://doi.org/${doi}`;
  if (/\bNICE\b/i.test(text)) {
    const code = text.match(NICE_CODE);
    if (code) return `https://www.nice.org.uk/guidance/${code[1].toLowerCase()}${code[2]}`;
  }
  return null;
}

export function officialUrl(doc: {
  official_url?: string | null;
  source_reference?: string | null;
  reference?: string | null;
  title?: string | null;
}): string | null {
  return safeLink(doc.official_url) ?? derivedOfficialUrl(doc.source_reference ?? doc.reference, doc.title);
}
