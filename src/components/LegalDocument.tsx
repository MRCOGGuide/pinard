import { Fragment, type ReactNode } from "react";
import { placeholderLabel } from "@/lib/legalShared";

/**
 * A legal page from the plain text the owner edits in Admin (Phase 11).
 *
 * The format is deliberately small, and never HTML, so nothing typed
 * into the editor can run in a visitor's browser:
 *
 *   ## Heading            a numbered section heading
 *   ### Heading           a sub-heading
 *   - item                a bullet (consecutive lines make one list)
 *   | a | b |             a table row (the first row is the header;
 *                         a |---| row under it is skipped)
 *   > text                a highlighted note
 *   blank line            ends a paragraph
 *
 * and, inside any line: **bold**, [text](/path or https://... or
 * mailto:...), and {{token}} for a detail from Admin > Legal details.
 * A required detail not filled in yet prints as a marked gap.
 */

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "note"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[][] };

export function parseLegal(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else if (/^[-*] /.test(line)) {
      flush();
      if (last?.kind === "list") last.items.push(line.slice(2));
      else blocks.push({ kind: "list", items: [line.slice(2)] });
    } else if (line.startsWith("|")) {
      flush();
      if (/^\|[\s:|-]+\|?$/.test(line)) continue;
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (last?.kind === "table") last.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells] });
    } else if (line.startsWith("> ")) {
      flush();
      if (last?.kind === "note") last.text += " " + line.slice(2);
      else blocks.push({ kind: "note", text: line.slice(2) });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

const LINK = "text-good underline decoration-good/40 underline-offset-2 hover:decoration-good";

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return href;
  if (/^https:\/\/[^\s]+$/.test(href)) return href;
  if (/^mailto:[^\s]+$/.test(href)) return href;
  return null;
}

function Gap({ token }: { token: string }) {
  return (
    <mark className="rounded bg-accent/15 px-1 font-medium text-accent-ink">
      {placeholderLabel(token)}
    </mark>
  );
}

function Token({ token, values }: { token: string; values: Record<string, string> }) {
  if (!(token in values)) return <Gap token={token} />;
  const value = values[token];
  if (token === "email" && value) {
    return (
      <a href={`mailto:${value}`} className={LINK}>
        {value}
      </a>
    );
  }
  const lines = value.split("\n");
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {l}
        </Fragment>
      ))}
    </>
  );
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\{\{(\w+)\}\}/g;

export function Inline({ text, values }: { text: string; values: Record<string, string> }): ReactNode {
  const out: ReactNode[] = [];
  let at = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    const key = n++;
    if (m[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-ink-strong">
          <Inline text={m[1]} values={values} />
        </strong>
      );
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      const label = <Inline text={m[2]} values={values} />;
      out.push(
        href ? (
          <a
            key={key}
            href={href}
            className={LINK}
            {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        )
      );
    } else {
      out.push(<Token key={key} token={m[4]} values={values} />);
    }
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

export function LegalDocument({ source, values }: { source: string; values: Record<string, string> }) {
  const blocks = parseLegal(source);

  // Grouped under each ## heading, so a section reads as one unit to a
  // screen reader as well as to the eye.
  const groups: { heading?: string; blocks: Block[] }[] = [{ blocks: [] }];
  for (const b of blocks) {
    if (b.kind === "h2") groups.push({ heading: b.text, blocks: [] });
    else groups[groups.length - 1].blocks.push(b);
  }

  return (
    <div className="font-ui text-[16px] leading-relaxed text-ink/85">
      {groups.map((g, gi) =>
        !g.heading && g.blocks.length === 0 ? null : (
          <section key={gi} className="mb-6">
            {g.heading && (
              <h2 className="mb-2 font-display text-[21px] font-semibold leading-snug text-ink-strong">
                <Inline text={g.heading} values={values} />
              </h2>
            )}
            <div className="space-y-2">
              {g.blocks.map((b, bi) => (
                <BlockView key={bi} block={b} values={values} />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function BlockView({ block, values }: { block: Block; values: Record<string, string> }) {
  switch (block.kind) {
    case "h3":
      return (
        <h3 className="pt-2 font-ui text-[16px] font-semibold text-ink-strong">
          <Inline text={block.text} values={values} />
        </h3>
      );
    case "p":
      return (
        <p>
          <Inline text={block.text} values={values} />
        </p>
      );
    case "note":
      return (
        <p className="rounded-control border border-line bg-sunk px-4 py-3 text-ink-strong">
          <Inline text={block.text} values={values} />
        </p>
      );
    case "list":
      return (
        <ul className="ml-5 list-disc space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline text={item} values={values} />
            </li>
          ))}
        </ul>
      );
    case "table": {
      const [head, ...rows] = block.rows;
      return (
        <div className="overflow-x-auto rounded-control border border-line">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-sunk">
              <tr>
                {head.map((c, i) => (
                  <th key={i} scope="col" className="border-b border-line px-3 py-2 font-semibold text-ink-strong">
                    <Inline text={c} values={values} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line last:border-b-0 align-top">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2">
                      <Inline text={c} values={values} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}
