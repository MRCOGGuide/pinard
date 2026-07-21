import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { Bullets, LastUpdated, Section } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Pinard",
};

export default function PrivacyPage() {
  return (
    <>
      <TraceHeader title="Privacy Policy" />
      <LastUpdated date="21 July 2026" />

      <p className="mb-6 text-sm leading-relaxed text-graphite/85">
        This Privacy Policy explains how Pinard (&ldquo;we&rdquo;) collects and
        uses your personal data, and your rights. We are the data controller. It
        is written to meet
        the EU and UK General Data Protection Regulation (GDPR) and the Irish
        Data Protection Act 2018, and we apply the same standards to users in
        the United States, Canada and elsewhere.
      </p>

      <Section n={1} title="Data we collect">
        <Bullets
          items={[
            <><strong>Account data:</strong> your name and email address, and a securely hashed password (managed by our authentication provider — we never see your password).</>,
            <><strong>Revision data:</strong> your exam part and date, your answers, performance, study plan and streaks.</>,
            <><strong>Payment data:</strong> your subscription status and history. Card payments are processed by Stripe; <strong>we do not receive or store your card details.</strong></>,
            <><strong>Technical data:</strong> essential cookies to keep you signed in, and basic logs needed to run and secure the Service.</>,
          ]}
        />
      </Section>

      <Section n={2} title="How and why we use it (legal bases)">
        <Bullets
          items={[
            <><strong>To provide the Service</strong> — create your account, run your plan and sessions, and track progress (legal basis: performance of our contract with you).</>,
            <><strong>To take payment</strong> and manage subscriptions (contract; legal obligation for tax/accounting records).</>,
            <><strong>To secure and improve the Service</strong>, prevent account sharing and fraud (our legitimate interests in running a safe, sustainable service).</>,
            <><strong>To contact you</strong> about your account or important changes (contract / legitimate interests), and to send optional revision reminders only where you have chosen to receive them (consent, which you can withdraw at any time).</>,
          ]}
        />
      </Section>

      <Section n={3} title="Who we share it with (processors)">
        <p>
          We do not sell your personal data. We share it only with service
          providers who process it on our instructions:
        </p>
        <Bullets
          items={[
            <><strong>Supabase</strong> — database, authentication and file storage.</>,
            <><strong>Stripe</strong> — payment processing and subscription billing.</>,
            <><strong>Vercel</strong> — application hosting.</>,
            <><strong>Resend</strong> — sending emails (where enabled).</>,
            <><strong>Anthropic</strong> and <strong>Voyage AI</strong> — used to generate and index revision content. This processing operates on our source guidelines and question text; <strong>your personal revision data and identity are not sent to these providers to train their models.</strong></>,
          ]}
        />
        <p>
          We may also disclose data where required by law, or to protect our
          rights, users or the Service.
        </p>
      </Section>

      <Section n={4} title="International transfers">
        <p>
          Some providers are based in the United States or other countries
          outside the EEA/UK. Where personal data is transferred internationally,
          we rely on appropriate safeguards such as the European
          Commission&rsquo;s Standard Contractual Clauses (and the UK addendum),
          so your data remains protected.
        </p>
      </Section>

      <Section n={5} title="How long we keep it">
        <p>
          We keep your data for as long as your account is active, and for a
          reasonable period afterwards to meet legal, tax and accounting
          obligations and to resolve disputes. You can ask us to delete your
          account and associated personal data at any time (subject to records
          we must retain by law).
        </p>
      </Section>

      <Section n={6} title="Your rights">
        <p>
          Depending on where you live, you have rights to access, correct,
          delete, restrict or object to the processing of your personal data, to
          data portability, and to withdraw consent. EU/UK/Irish users have
          these rights under GDPR; California residents have comparable rights
          under the CCPA/CPRA, and Canadian users under PIPEDA. To exercise any
          right, contact us at <strong>support@pinardapp.com</strong>.
        </p>
        <p>
          You also have the right to complain to a supervisory authority — for
          example the Irish Data Protection Commission (<span className="font-mono text-xs">dataprotection.ie</span>)
          or the UK Information Commissioner&rsquo;s Office (<span className="font-mono text-xs">ico.org.uk</span>).
        </p>
      </Section>

      <Section n={7} title="Cookies">
        <p>
          We use only the essential cookies needed to sign you in and keep the
          Service secure. We do not use advertising or third-party tracking
          cookies.
        </p>
      </Section>

      <Section n={8} title="Security">
        <p>
          We take reasonable technical and organisational measures to protect
          your data, including encryption in transit and access controls. No
          system is perfectly secure, but we work to keep your data safe and to
          notify you and the relevant authority of any breach where the law
          requires.
        </p>
      </Section>

      <Section n={9} title="Children">
        <p>
          The Service is for adults (18+) and is not directed at children. We do
          not knowingly collect data from anyone under 18.
        </p>
      </Section>

      <Section n={10} title="Changes and contact">
        <p>
          We may update this policy and will post the new version with an
          updated date. For any privacy question or request, contact{" "}
          <strong>support@pinardapp.com</strong>.
        </p>
      </Section>
    </>
  );
}
