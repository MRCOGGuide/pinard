import Link from "next/link";
import {
  ASK_MONTHLY_LIMIT,
  ASK_TOPUP_PRICE_PENCE,
  ASK_TOPUP_QUESTIONS,
} from "@/lib/askAllowance";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { Bullets, LastUpdated, Section } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Terms & Conditions — Pinard",
};

export default function TermsPage() {
  return (
    <>
      <TraceHeader title="Terms &amp; Conditions" />
      <LastUpdated date="21 July 2026" />

      <p className="mb-6 text-sm leading-relaxed text-graphite/85">
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of
        Pinard (the &ldquo;Service&rdquo;, &ldquo;Pinard&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an
        account or using the Service you agree to these Terms. If you do not
        agree, do not use the Service.
      </p>

      <Section n={1} title="Who can use Pinard">
        <p>
          You must be at least 18 years old and able to form a legally binding
          contract. The Service is intended for doctors and trainees preparing
          for the MRCOG examinations. You are responsible for keeping your
          login details secure and for all activity under your account.
        </p>
      </Section>

      <Section n={2} title="One account, one person">
        <p>
          An account is personal to you and may not be shared, sold or
          transferred. Only one device may be signed in at a time; signing in
          elsewhere ends the previous session. We may suspend accounts we
          reasonably believe are being shared or used by more than one person.
        </p>
      </Section>

      <Section n={3} title="What Pinard is — and is not">
        <p>
          Pinard is an <strong>educational revision aid</strong>. It is provided
          for exam-preparation purposes only. It is <strong>not</strong>:
        </p>
        <Bullets
          items={[
            <>a source of clinical, medical or diagnostic advice, and must never be relied upon in the care of any patient;</>,
            <>professional, legal, financial or examination advice;</>,
            <>a substitute for official examination materials, syllabuses, textbooks or the primary guidelines on which its content is based;</>,
            <>a guarantee, representation or warranty that you will pass any examination or achieve any particular result.</>,
          ]}
        />
        <p>
          You remain solely responsible for your own study, your clinical
          practice and your professional judgement. Always verify clinical
          information against current primary sources.
        </p>
      </Section>

      <Section n={4} title="Content and accuracy">
        <p>
          Pinard&rsquo;s questions and explanations are generated from
          third-party guidance (including materials published by the RCOG, NICE,
          ESHRE, BSGE and other bodies) and are reviewed before release. We take
          reasonable care, but:
        </p>
        <Bullets
          items={[
            <>guidance changes over time and content may not always reflect the very latest revisions;</>,
            <>content may contain errors or omissions, and is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;;</>,
            <>we do not warrant that the Service will be uninterrupted, error-free or fit for any particular purpose beyond general exam revision.</>,
          ]}
        />
        <p>
          Where you believe a question is incorrect, please flag it so we can
          review it.
        </p>
      </Section>

      <Section n={5} title="Subscriptions, billing and price changes">
        <Bullets
          items={[
            <>Paid plans are billed in advance through our payment processor (Stripe). We do not store your card details.</>,
            <>Subscriptions renew automatically at the end of each period at the then-current price until cancelled.</>,
            <>You can cancel at any time from <em>Account → Manage billing</em>; cancellation stops future renewals and you keep access until the end of the paid period.</>,
            <>We may change prices; changes apply to renewals after we give you reasonable notice. Your continued use after a change takes effect is acceptance of the new price.</>,
          ]}
        />
        <p>
          Refunds and cooling-off rights are covered in our{" "}
          <Link href="/refunds" className="text-greentop">
            Refund &amp; Cancellation Policy
          </Link>
          , which forms part of these Terms.
        </p>
      </Section>

      <Section n={6} title="Ask Pinard usage allowance">
        <p>
          Ask Pinard answers your questions from our source library. Because
          each answer is produced individually, the feature carries a fair-use
          allowance:
        </p>
        <Bullets
          items={[
            <>Every paid plan includes {ASK_MONTHLY_LIMIT} Ask Pinard questions per calendar month.</>,
            <>The monthly allowance resets on the 1st of each month. Unused questions do not carry over.</>,
            <>If you reach the allowance you may buy a top-up of {ASK_TOPUP_QUESTIONS} additional questions for £{(ASK_TOPUP_PRICE_PENCE / 100).toFixed(2)}. Top-up questions are used only after the monthly allowance is exhausted, and are not reset monthly.</>,
            <>Unused top-up questions carry forward while your subscription continues, including across renewals. They expire when your subscription ends.</>,
            <>Top-up purchases are one-off payments, not a subscription, and do not renew automatically.</>,
            <>Top-up questions have no cash value and are not refundable once used. Where your subscription ends, the Refund &amp; Cancellation Policy applies.</>,
            <>The allowance is per account and may not be shared. We may adjust the allowance or the top-up price on reasonable notice, and may apply proportionate limits where use is automated or abusive.</>,
          ]}
        />
        <p>
          The rest of the Service — questions, sessions, your plan and progress
          — is not metered and remains subject only to fair use.
        </p>
      </Section>

      <Section n={7} title="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            <>copy, scrape, reproduce, resell, publish or redistribute any questions, explanations or other content;</>,
            <>share your account or circumvent access, security or single-session controls;</>,
            <>use automated means to access the Service, or attempt to disrupt or reverse-engineer it;</>,
            <>use the Service unlawfully or in any way that infringes the rights of others.</>,
          ]}
        />
      </Section>

      <Section n={8} title="Intellectual property">
        <p>
          The Service, its software, design, and all questions, explanations and
          other content are owned by Pinard or its licensors and are protected
          by intellectual-property laws. We grant you a limited, personal,
          non-transferable, revocable licence to use the Service for your own
          exam preparation. No other rights are granted.
        </p>
      </Section>

      <Section n={9} title="Disclaimers">
        <p>
          To the fullest extent permitted by law, and subject to section 9, the
          Service is provided without warranties of any kind, whether express or
          implied, including any implied warranties of satisfactory quality,
          fitness for a particular purpose, accuracy or non-infringement.
        </p>
      </Section>

      <Section n={10} title="Limitation of liability">
        <p>
          Nothing in these Terms excludes or limits our liability where it would
          be unlawful to do so — including liability for death or personal
          injury caused by our negligence, for fraud or fraudulent
          misrepresentation, or for any statutory rights you have as a consumer
          that cannot be excluded.
        </p>
        <p>Subject to that paragraph, to the fullest extent permitted by law:</p>
        <Bullets
          items={[
            <>we are not liable for any indirect, incidental, special or consequential loss, or for loss of profits, opportunity, goodwill or exam outcomes;</>,
            <>we are not liable for any loss arising from your reliance on the content for any clinical or professional purpose;</>,
            <>our total liability to you for all claims connected with the Service in any 12-month period is limited to the amount you paid us for the Service in that period.</>,
          ]}
        />
      </Section>

      <Section n={11} title="Indemnity">
        <p>
          To the extent permitted by law, you agree to indemnify us against
          reasonable losses and costs arising from your breach of these Terms or
          your misuse of the Service. This does not apply to the extent a loss
          is caused by us.
        </p>
      </Section>

      <Section n={12} title="Suspension and termination">
        <p>
          We may suspend or end your access if you materially breach these Terms
          (including account sharing or misuse). You may stop using the Service
          and close your account at any time.
        </p>
      </Section>

      <Section n={13} title="Third-party services">
        <p>
          The Service relies on third parties (for example Stripe for payments
          and our hosting and infrastructure providers). Their services are
          governed by their own terms, and we are not responsible for them.
        </p>
      </Section>

      <Section n={14} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time. We will post the updated
          version with a new &ldquo;last updated&rdquo; date and, for material
          changes, take reasonable steps to notify you. Continued use after
          changes take effect is acceptance of the updated Terms.
        </p>
      </Section>

      <Section n={15} title="Governing law, your rights and disputes">
        <p>
          These Terms are governed by the laws of the Republic of Ireland, and
          the courts of Ireland have jurisdiction. Importantly, if you are
          a consumer, this does not deprive you of the mandatory protections and
          rights available to you under the law of your country of residence —
          including consumers in the EU, the UK, the United States and Canada —
          and you may be able to bring proceedings in your local courts.
        </p>
        <p>
          EU consumers can also use the European Commission&rsquo;s Online
          Dispute Resolution platform at{" "}
          <span className="font-mono text-xs">ec.europa.eu/consumers/odr</span>.
          We would always prefer to resolve any concern directly first — please
          contact us.
        </p>
      </Section>

      <Section n={16} title="General">
        <p>
          If any provision is found unenforceable, the rest remain in effect.
          Our failure to enforce a term is not a waiver of it. These Terms,
          together with the Privacy Policy and Refund &amp; Cancellation Policy,
          are the entire agreement between us regarding the Service.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these Terms:{" "}
          <strong>support@pinardapp.com</strong>.
        </p>
      </Section>
    </>
  );
}
