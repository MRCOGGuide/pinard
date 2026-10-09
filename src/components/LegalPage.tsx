import { TraceHeader } from "@/components/TraceHeader";
import { LastUpdated } from "@/components/Legal";
import { LegalDocument } from "@/components/LegalDocument";
import { getLegalDetails, getLegalDocument, LEGAL_DOCS, legalValues, type LegalDocKey } from "@/lib/legal";
import { ASK_MONTHLY_LIMIT, ASK_TOPUP_PRICE_PENCE, ASK_TOPUP_QUESTIONS } from "@/lib/askAllowance";

/** Figures the pages quote that the code, not the owner, decides. */
export function legalFigures(): Record<string, string> {
  return {
    ask_monthly_limit: String(ASK_MONTHLY_LIMIT),
    ask_topup_questions: String(ASK_TOPUP_QUESTIONS),
    ask_topup_price: `£${(ASK_TOPUP_PRICE_PENCE / 100).toFixed(2)}`,
  };
}

/**
 * One legal page: the owner's wording from Admin if they have edited it,
 * the default otherwise, with their trader details filled in. Readable
 * without the pilot access code (middleware), because a policy someone
 * must agree to cannot be behind the thing they are agreeing to.
 */
export async function LegalPage({ doc }: { doc: LegalDocKey }) {
  const [page, details] = await Promise.all([getLegalDocument(doc), getLegalDetails()]);
  const title = LEGAL_DOCS.find((d) => d.key === doc)?.title ?? "";
  return (
    <>
      <TraceHeader title={title} />
      <LastUpdated date={page.updated} />
      <LegalDocument source={page.body} values={legalValues(details, legalFigures())} />
    </>
  );
}
