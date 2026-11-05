/**
 * Reading an answer while it is still being written (the owner's brief,
 * part 6: "stream the answer so the first words appear straight away").
 *
 * The reply arrives as a tool call, so what is on the wire is JSON that
 * is not finished yet. This pulls out the lines that are complete: a
 * line is only worth checking, and only safe to show, once it has ended.
 * Nothing here decides what is shown; the caller checks each line first.
 */

/** A JSON string's text, from just after its opening quote, as far as it has been written. */
function readString(json: string, from: number): { text: string; closed: boolean } {
  let text = "";
  for (let i = from; i < json.length; i++) {
    const c = json[i];
    if (c === '"') return { text, closed: true };
    if (c !== "\\") {
      text += c;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) break;
    if (next === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      text += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    text += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[next] ?? next;
    i += 1;
  }
  return { text, closed: false };
}

/** Each risk written in full under one of the scenario's two fields. */
function risksIn(json: string, field: string, until: number): string[] {
  const start = json.indexOf(`"${field}"`);
  if (start < 0) return [];
  const part = json.slice(start, until < start ? undefined : until);
  const risks: string[] = [];
  for (const match of part.matchAll(/"risk"\s*:\s*"/g)) {
    const { text, closed } = readString(part, match.index + match[0].length);
    if (closed && text.trim()) risks.push(`- ${text.trim()}`);
  }
  return risks;
}

/**
 * The complete lines of the reply so far, in the order they will be read.
 * A scenario's risks come first, as parseReply lays them out. Blank lines
 * are dropped: the page spaces the stages itself.
 */
export function draftLines(partial: string): string[] {
  const replyAt = partial.search(/"reply"\s*:\s*"/);
  const babyAt = partial.indexOf('"risks_to_baby"');
  const mother = risksIn(partial, "risks_to_mother", babyAt >= 0 ? babyAt : replyAt);
  const baby = risksIn(partial, "risks_to_baby", replyAt);
  const lines = [
    ...(mother.length ? ["Risks to the mother", ...mother] : []),
    ...(baby.length ? ["Risks to the baby", ...baby] : []),
  ];
  if (replyAt < 0) return lines;
  const opening = partial.slice(replyAt).match(/"reply"\s*:\s*"/)![0].length;
  const { text, closed } = readString(partial, replyAt + opening);
  const written = text.split("\n");
  if (!closed) written.pop();
  return [...lines, ...written.map((l) => l.trim()).filter(Boolean)];
}
