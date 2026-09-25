import { Fragment } from "react";

/**
 * An EMQ lead-in, with its theme in bold.
 *
 * A lead-in is two sentences of near-identical boilerplate wrapped
 * around the one phrase that says what the set is about — "Each of the
 * following clinical scenarios relates to fertility treatment using
 * donor gametes or embryos in the UK. For each patient, select the
 * SINGLE most appropriate answer from the list above…". Read at speed,
 * under exam conditions, the subject is the hardest part to find,
 * because it sits in the middle of the sentence every other set also
 * opens with. Bold picks it out at a glance.
 *
 * The theme is marked in the stored text the way it is written
 * everywhere else — between pairs of asterisks — so the lead-in stays
 * one readable string in the database, in an export, and in the style
 * examples shown to the generator.
 */
export function LeadIn({ text, className }: { text: string; className?: string }) {
  return <p className={className}>{renderEmphasis(text)}</p>;
}

/**
 * Split on `**…**`. An unmatched pair is left as written rather than
 * swallowed: a stray asterisk should look wrong, not disappear.
 */
export function renderEmphasis(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-ink-strong">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
