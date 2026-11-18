import type { Metadata } from "next";
import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { getLegalDetails } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact: Pinard",
  description: "How to reach Pinard about your account, a refund, a question you think is wrong, or your data.",
};

// The details are the owner's, saved in Admin > Legal: read on each visit.
export const dynamic = "force-dynamic";

/**
 * How to reach Pinard (pre-launch review, 18 November 2026: the support
 * address was only inside the legal pages, and consumer law asks for an
 * email, a telephone number and a postal address a customer can find).
 * The details are the ones the legal pages quote, from Admin > Legal, so
 * they are written in one place.
 */
export default async function ContactPage() {
  const details = await getLegalDetails();
  const email = details.legal_email || "support@pinardapp.com";
  const trader = [details.legal_name, details.legal_trading_name && `trading as ${details.legal_trading_name}`]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-2xl">
      <TraceHeader title="Contact" lede="We read every message, and aim to reply within two working days." />

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="font-display text-[22px] font-medium text-ink-strong">Email</h2>
        <p className="mt-1 font-ui text-[16px] text-ink/85">
          <a href={`mailto:${email}`} className="font-semibold text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            {email}
          </a>
        </p>
        {details.legal_phone && (
          <>
            <h2 className="mt-5 font-display text-[22px] font-medium text-ink-strong">Telephone</h2>
            <p className="mt-1 font-ui text-[16px] text-ink/85">
              <a href={`tel:${details.legal_phone.replace(/[^\d+]/g, "")}`} className="text-ink-strong">
                {details.legal_phone}
              </a>
            </p>
          </>
        )}
        {details.legal_address && (
          <>
            <h2 className="mt-5 font-display text-[22px] font-medium text-ink-strong">Post</h2>
            <p className="mt-1 whitespace-pre-line font-ui text-[16px] text-ink/85">
              {trader ? `${trader}\n` : ""}
              {details.legal_address}
            </p>
          </>
        )}
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="font-display text-[22px] font-medium text-ink-strong">Quicker routes</h2>
        <ul className="mt-2 space-y-2 font-ui text-[16px] text-ink/85">
          <li>
            <strong className="text-ink-strong">A question you think is wrong:</strong> use Report under the question. It
            reaches the clinician who approves the questions, with the question attached.
          </li>
          <li>
            <strong className="text-ink-strong">A refund or withdrawal:</strong> within 14 days of buying, use Withdraw on
            your{" "}
            <Link href="/account" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              Account
            </Link>{" "}
            page; the{" "}
            <Link href="/refunds" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              refund policy
            </Link>{" "}
            explains the rest.
          </li>
          <li>
            <strong className="text-ink-strong">Your data:</strong> download it or delete your account from your Account page,
            or see the{" "}
            <Link href="/privacy" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              privacy policy
            </Link>
            .
          </li>
          <li>
            <strong className="text-ink-strong">A forgotten password:</strong>{" "}
            <Link href="/forgot-password" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              reset it here
            </Link>
            .
          </li>
        </ul>
      </section>

      <p className="mt-6 font-ui text-[14px] text-ink/65">
        Pinard is a revision aid for the MRCOG examinations, independent of the Royal College of Obstetricians and
        Gynaecologists. It cannot answer clinical questions about a patient.
      </p>
    </div>
  );
}
