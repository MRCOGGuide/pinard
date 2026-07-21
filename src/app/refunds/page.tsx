import Link from "next/link";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { Bullets, LastUpdated, Section } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Pinard",
};

export default function RefundsPage() {
  return (
    <>
      <TraceHeader title="Refund &amp; Cancellation Policy" />
      <LastUpdated date="21 July 2026" />

      <p className="mb-6 text-sm leading-relaxed text-graphite/85">
        We want you to buy with confidence. This policy explains your statutory
        rights and our own satisfaction guarantee. It forms part of our{" "}
        <Link href="/terms" className="text-greentop">
          Terms &amp; Conditions
        </Link>
        . Nothing here removes any mandatory legal right you have as a consumer.
      </p>

      <Section title="Cancelling your subscription">
        <p>
          You can cancel at any time from <em>Account → Manage billing</em>.
          Cancelling stops future renewals; you keep full access until the end
          of the period you have already paid for. We do not charge a
          cancellation fee.
        </p>
      </Section>

      <Section title="EU, UK and Ireland — 14-day cooling-off right">
        <p>
          If you are a consumer in the EU, the UK or Ireland, you have a
          statutory right to cancel a distance contract within{" "}
          <strong>14 days</strong> of subscribing, under the EU Consumer Rights
          Directive, the UK Consumer Contracts Regulations 2013 and the Irish
          Consumer Rights Act 2022.
        </p>
        <Bullets
          items={[
            <>If you ask us to start providing the Service during the 14-day period, you consent to us doing so, and you may be charged a proportionate amount for the access you used before cancelling.</>,
            <>If you have not used the Service, you are entitled to a full refund.</>,
            <>To cancel within the cooling-off period, simply email us at <strong>[support email]</strong> — a clear statement that you wish to cancel is enough.</>,
            <>We will refund you using your original payment method within 14 days of being informed.</>,
          ]}
        />
      </Section>

      <Section title="Our 7-day satisfaction guarantee (everyone)">
        <p>
          On top of any statutory right, we offer all subscribers a{" "}
          <strong>7-day, no-questions-asked satisfaction refund</strong> on a
          first subscription: if Pinard isn&rsquo;t right for you, email us
          within 7 days of your first payment and we&rsquo;ll refund it. This is
          a goodwill guarantee and does not reduce your statutory rights above.
        </p>
      </Section>

      <Section title="United States and Canada">
        <p>
          There is generally no statutory cooling-off period for online
          subscriptions in the United States or Canada, but our{" "}
          <strong>7-day satisfaction guarantee</strong> above applies to you as
          well. After that window, subscriptions are non-refundable except where
          required by applicable state, provincial or federal consumer law, or
          at our discretion.
        </p>
      </Section>

      <Section title="Renewals and part-periods">
        <p>
          Because you are reminded before renewal and can cancel at any time,
          charges for renewal periods and unused parts of a period are not
          normally refundable after the windows above, except where the law
          requires or we agree otherwise. If we ever materially fail to provide
          the Service, you may be entitled to a refund under consumer law.
        </p>
      </Section>

      <Section title="Discounts and vouchers">
        <p>
          Where a discount, founding-member offer or voucher code applied, any
          refund is based on the amount actually paid.
        </p>
      </Section>

      <Section title="How to request a refund">
        <p>
          Email <strong>[support email]</strong> from your account email address
          with your name and the reason (a reason isn&rsquo;t required for the
          7-day guarantee). Please contact us before starting a card chargeback —
          it&rsquo;s usually much faster for us to resolve it directly.
        </p>
      </Section>
    </>
  );
}
