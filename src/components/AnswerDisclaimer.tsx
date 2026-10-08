import Link from "next/link";

/**
 * The line under every Ask Pinard answer.
 *
 * Printed by the app rather than written by the model, so it is the
 * same words every time, cannot be left out of an answer the model
 * forgot it on, and is never replayed to the model as part of the
 * conversation. The wording follows section 3 of the terms: an
 * educational revision aid, not clinical advice, never relied on in the
 * care of a patient.
 */
export function AnswerDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-label leading-relaxed text-ink/65 ${className}`}>
      Educational revision content only. Not clinical advice: do not rely on
      it in the care of any patient. Check current guidance and use your own
      clinical judgement.{" "}
      <Link href="/terms" className="underline hover:text-ink/70">
        Terms
      </Link>
    </p>
  );
}
