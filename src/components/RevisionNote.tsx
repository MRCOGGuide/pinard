import Link from "next/link";

/**
 * Said where explanations are read (Phase 11): what the content is, how
 * it was made, and that it is not for the care of a patient. Questions
 * are drafted with AI and approved by a person before release, unlike
 * Ask Pinard's answers, which carry their own line (AnswerDisclaimer).
 */
export function RevisionNote({ className = "" }: { className?: string }) {
  return (
    <p className={`font-ui text-[13px] leading-relaxed text-ink/65 ${className}`.trim()}>
      A revision aid, not clinical advice. Drafted with AI from the guidance cited and approved by a Member of
      the RCOG before release.{" "}
      <Link href="/terms" className="underline hover:text-ink/80">
        How content is made
      </Link>
    </p>
  );
}
