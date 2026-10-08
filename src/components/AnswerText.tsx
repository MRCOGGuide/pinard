import { Fragment } from "react";

/**
 * An answer laid out, rather than printed as one block of text.
 *
 * Ask Pinard now returns a pathway — a stage on its own line, the
 * things to do under it, one per line — and `whitespace-pre-wrap`
 * rendered that as a wall with some line breaks in it. The content was
 * right and unreadable, which on a revision screen is the same as
 * wrong.
 *
 * Three line shapes, and nothing else is recognised: a line beginning
 * "- " is a point, a short line with no full stop is the stage it
 * belongs to, and anything else is a paragraph. Deliberately not
 * markdown: the model is told not to write any, so a renderer that
 * accepted it would be inviting the one thing that would make these
 * answers look like everything else.
 */

/** A stage name: short, no sentence punctuation, not a bullet. */
function isHeading(line: string): boolean {
  return (
    line.length <= 40 &&
    !/[.;:]$/.test(line) &&
    !/^[-•]/.test(line) &&
    /^[A-Z]/.test(line)
  );
}

export function AnswerText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);

  const blocks: { kind: "heading" | "points" | "para"; lines: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^[-•]\s+/.test(line)) {
      const point = line.replace(/^[-•]\s+/, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === "points") last.lines.push(point);
      else blocks.push({ kind: "points", lines: [point] });
      continue;
    }

    blocks.push({
      kind: isHeading(line) ? "heading" : "para",
      lines: [line],
    });
  }

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink/85">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <p
              key={i}
              className={`font-ui text-[14px] font-semibold text-good ${
                i === 0 ? "" : "pt-1"
              }`}
            >
              {block.lines[0]}
            </p>
          );
        }
        if (block.kind === "points") {
          return (
            <ul key={i} className="space-y-1">
              {block.lines.map((point, n) => (
                <li key={n} className="flex gap-2">
                  {/* A marker that cannot be mistaken for a minus sign
                      at the start of a dose. */}
                  <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-good/70" />
                  <span className="min-w-0">{point}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <Fragment>{block.lines[0]}</Fragment>
          </p>
        );
      })}
    </div>
  );
}
