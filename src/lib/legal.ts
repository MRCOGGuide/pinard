import { readSettings, writeSetting } from "@/lib/settings";
import { LEGAL_DEFAULTS, LEGAL_DEFAULTS_UPDATED } from "@/lib/legalDefaults";
import { LEGAL_DOCS, LEGAL_FIELDS, type LegalDetails, type LegalDocKey } from "@/lib/legalShared";

export * from "@/lib/legalShared";

/**
 * The legal pages, and the trader details they quote, as things the
 * owner sets rather than things in the code (Phase 11).
 *
 * Both live in app_settings, the same text table the founding offer
 * uses, so no migration is needed. A detail is one key each
 * (legal_name, legal_address, ...). A page is one key holding JSON:
 * the body in the plain format LegalDocument renders, and the date it
 * was last changed. A page nobody has edited reads its default from
 * lib/legalDefaults, so a fresh database still shows every policy.
 */

const docKey = (doc: LegalDocKey) => `legal_doc_${doc}`;

export async function getLegalDetails(): Promise<LegalDetails> {
  const stored = await readSettings(LEGAL_FIELDS.map((f) => f.key));
  return Object.fromEntries(
    LEGAL_FIELDS.map((f) => [f.key, (stored[f.key] ?? f.fallback ?? "").trim()])
  ) as LegalDetails;
}

export async function saveLegalDetails(input: Record<string, string>): Promise<{ error?: string }> {
  for (const field of LEGAL_FIELDS) {
    const value = String(input[field.key] ?? "").trim().slice(0, field.multiline ? 600 : 200);
    const result = await writeSetting(field.key, value);
    if (result.error) return { error: "The details could not be saved. Try again." };
  }
  return {};
}

export type LegalDocument = {
  body: string;
  /** "9 October 2026", as printed under the title. */
  updated: string;
  /** False while the page still reads the wording in the code. */
  edited: boolean;
};

export async function getLegalDocument(doc: LegalDocKey): Promise<LegalDocument> {
  const stored = (await readSettings([docKey(doc)]))[docKey(doc)];
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { body?: unknown; updated?: unknown };
      if (typeof parsed.body === "string" && parsed.body.trim()) {
        return {
          body: parsed.body,
          updated: typeof parsed.updated === "string" ? parsed.updated : LEGAL_DEFAULTS_UPDATED,
          edited: true,
        };
      }
    } catch {
      // A row that is not JSON is ignored, and the default shown.
    }
  }
  return { body: LEGAL_DEFAULTS[doc], updated: LEGAL_DEFAULTS_UPDATED, edited: false };
}

/** Today in Ireland, as the pages print a date. */
export function legalDateToday(): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(new Date());
}

export async function saveLegalDocument(doc: LegalDocKey, body: string): Promise<{ error?: string }> {
  if (!LEGAL_DOCS.some((d) => d.key === doc)) return { error: "Unknown page." };
  const text = String(body ?? "").replace(/\r\n/g, "\n").slice(0, 60_000);
  if (!text.trim()) return { error: "A page cannot be empty. Use Restore the default instead." };
  const result = await writeSetting(docKey(doc), JSON.stringify({ body: text, updated: legalDateToday() }));
  return result.error ? { error: "The page could not be saved. Try again." } : {};
}

/** Back to the wording in the code: the stored copy is emptied, not
 *  deleted, which getLegalDocument reads as "use the default". */
export async function restoreLegalDocument(doc: LegalDocKey): Promise<{ error?: string }> {
  if (!LEGAL_DOCS.some((d) => d.key === doc)) return { error: "Unknown page." };
  const result = await writeSetting(docKey(doc), "");
  return result.error ? { error: "The page could not be restored. Try again." } : {};
}
