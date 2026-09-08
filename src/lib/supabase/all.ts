/**
 * Every row, not the first thousand.
 *
 * PostgREST caps a response at 1000 rows and says nothing about it: the
 * query succeeds, `data` holds 1000 rows, and there is no error to
 * check. The Question Bank read "All (1000)" for days while the bank
 * held 1005 — and because it ordered by review date, the five it
 * dropped were the five approved earliest, the least likely to be
 * missed.
 *
 * Worse where a count decides something. The queue asks how many
 * questions a document already has before queueing more of it; capped,
 * it under-counts coverage and queues work that did not need doing.
 *
 * So anything reading a list that can exceed a thousand rows pages
 * through it. Pass a function that applies `.range(from, to)` to the
 * query you want:
 *
 *   const rows = await fetchAll((from, to) =>
 *     supabase.from("generated_questions").select("*").range(from, to)
 *   );
 */
const PAGE = 1000;

/** A guard against paging for ever if a range is ignored. */
const MAX_PAGES = 200;

export async function fetchAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE;
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
