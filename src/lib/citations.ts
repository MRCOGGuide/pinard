/**
 * Which passages a question shows, and in what order.
 *
 * A question carries citations in two places: on the row, from
 * generation, and on each explanation, which is what that explanation
 * was actually written against. They are usually the same list. Where
 * they differ, the explanation on screen is the thing a candidate is
 * checking, so its citations lead and the row's follow as context.
 *
 * Kept out of the server action so it can be read, and tested, without
 * a database.
 */
export function citationOrder(
  answerCitations: number[] | undefined,
  questionCitations: number[] | undefined
): number[] {
  const ordered: number[] = [];
  for (const id of [...(answerCitations ?? []), ...(questionCitations ?? [])]) {
    if (!Number.isFinite(id)) continue;
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}
