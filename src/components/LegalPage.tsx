import { TraceHeader } from "@/components/TraceHeader";
import { LastUpdated } from "@/components/Legal";
import { LegalDocument } from "@/components/LegalDocument";
import { getLegalDetails, getLegalDocument, LEGAL_DOCS, legalValues, type LegalDocKey } from "@/lib/legal";
import { ASK_DAILY_FAIR_USE, ASK_MONTHLY_ALLOWANCE, CURRENCY, TOP_UPS } from "@/config/pricing";

const euro = (cents: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: CURRENCY.toUpperCase() }).format(cents / 100);

/** Figures the pages quote that the code, not the owner, decides. */
export function legalFigures(): Record<string, string> {
  return {
    ask_basic: String(ASK_MONTHLY_ALLOWANCE.basic),
    ask_plus: String(ASK_MONTHLY_ALLOWANCE.plus),
    ask_premium: String(ASK_MONTHLY_ALLOWANCE.premium),
    ask_fair_use: String(ASK_DAILY_FAIR_USE),
    ask_topups: TOP_UPS.map((t) => `${t.questions} questions for ${euro(t.price)}`).join(" or "),
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
