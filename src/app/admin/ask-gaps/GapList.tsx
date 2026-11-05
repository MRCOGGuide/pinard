import type { GroupedGap } from "@/lib/ask-gaps";
import { GapControls } from "./GapControls";

const STATUS_LABEL = { open: "Open", added: "Added to the library", not_a_gap: "Not a gap" };

export function GapList({ gaps }: { gaps: GroupedGap[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {gaps.map((g) => (
        <li key={g.ids[0]} className="px-4 py-3">
          <p className="font-ui text-[15px] text-ink-strong">{g.gap}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-ui text-[13px] text-ink/70">
            <span>
              {g.times === 1 ? "Once" : `${g.times} times`}, last on{" "}
              {new Date(g.last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {!g.open && `. ${STATUS_LABEL[g.status]}`}
            </span>
            <GapControls ids={g.ids} open={g.open} />
          </div>
        </li>
      ))}
    </ul>
  );
}
