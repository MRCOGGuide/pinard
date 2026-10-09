import { TraceHeader } from "@/components/TraceHeader";
import { legalFigures } from "@/components/LegalPage";
import { getLegalDetails, getLegalDocument, LEGAL_DOCS, LEGAL_FIELDS } from "@/lib/legal";
import { LEGAL_DEFAULTS } from "@/lib/legalDefaults";
import { LegalDetailsForm } from "./LegalDetailsForm";
import { LegalPagesEditor } from "./LegalPagesEditor";

export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const [details, ...pages] = await Promise.all([
    getLegalDetails(),
    ...LEGAL_DOCS.map((d) => getLegalDocument(d.key)),
  ]);
  const missing = LEGAL_FIELDS.filter((f) => f.required && !details[f.key]);

  return (
    <>
      <TraceHeader
        title="Legal"
        eyebrow="Owner area"
        lede="Your trader details, and the wording of the Terms, Privacy, Refunds, Cookies and Accessibility pages."
      />

      {missing.length > 0 && (
        <p className="mb-6 rounded-control border border-accent/40 bg-accent/10 px-4 py-3 font-ui text-[15px] text-accent-ink">
          Still to fill in: {missing.map((f) => f.label.toLowerCase()).join(", ")}. Until you do,
          the legal pages show a marked gap where each one goes. Consumer law requires your
          name, a postal address and an email address before you take payment.
        </p>
      )}

      <LegalDetailsForm details={details} />

      <LegalPagesEditor
        pages={LEGAL_DOCS.map((d, i) => ({
          key: d.key,
          title: d.title,
          href: d.href,
          body: pages[i].body,
          updated: pages[i].updated,
          edited: pages[i].edited,
          defaultBody: LEGAL_DEFAULTS[d.key],
        }))}
        figures={legalFigures()}
        details={details}
      />
    </>
  );
}
