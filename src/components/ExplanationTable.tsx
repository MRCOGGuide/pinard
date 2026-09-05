import type { ExplanationTable as TableData } from "@/lib/explanationTable";

/**
 * The stratification a question turns on, shown as the table it is.
 *
 * The row the question tests is marked rather than isolated: the point
 * of a table is the rows either side of the answer — 1 in 100 for
 * cervical injury is only meaningful next to 1-4 in 1000 for
 * perforation, and that neighbour is exactly the distractor a candidate
 * reaches for.
 *
 * Scrolls sideways inside its own box on a narrow screen rather than
 * pushing the card wider, since a phone is where most revision happens.
 */
export function ExplanationTable({ table }: { table: TableData }) {
  return (
    <figure className="mt-4">
      <figcaption className="font-mono text-[11px] uppercase tracking-wide text-greentop">
        {table.caption}
      </figcaption>
      <div className="mt-1.5 overflow-x-auto rounded-card border border-hairline bg-white/70">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline">
              {table.columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-graphite/70"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => {
              const marked = table.highlight === i;
              return (
                <tr
                  key={i}
                  className={`border-b border-hairline/60 last:border-0 ${
                    marked ? "bg-sage" : ""
                  }`}
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`px-3 py-2 align-top ${
                        marked
                          ? "font-medium text-theatre"
                          : "text-graphite/80"
                      }`}
                    >
                      {cell}
                      {/* Named for a screen reader, which cannot see the
                          shading that says which row this question is. */}
                      {marked && j === 0 && (
                        <span className="sr-only"> — this question</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
