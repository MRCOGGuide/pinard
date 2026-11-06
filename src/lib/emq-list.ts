import type Anthropic from "@anthropic-ai/sdk";

/**
 * An EMQ list that gives the answer away. A scenario must not be answerable
 * by spotting the only option of the right kind: the only figure, the only
 * drug, the only scan. The owner's rule, and where the owner's own edits to
 * sets have fallen. Telling the writer to keep a list to one kind was not
 * enough, so a finished set is read for it.
 */
const LIST_PROMPT = `You check one extended matching question (EMQ) set for MRCOG. It has one shared option list and several scenarios.

For each scenario, work out what kind of thing it asks for (a drug, a figure, a scan, an operation, a person, a timing). Then count the options of that kind.

A scenario is at fault when a candidate who knows no medicine could pick the answer because it is the ONLY option of that kind in the list.

Do not fault a scenario for any other reason. Two or more options of the kind is not a fault. Be literal about kinds: management steps are one kind, however different they are.

Return ONLY a JSON object: {"faults": [{"scenario": 2, "kind": "a surveillance test", "why": "Serial growth scans is the only surveillance option"}]}
If there is no fault, return {"faults": []}.`;

type Fault = { scenario?: unknown; kind?: unknown; why?: unknown };

/** One problem for each scenario at fault. A failed check finds none: it must not cost a sound set. */
export async function listProblems(
  leadIn: string,
  options: { key: string; text: string }[],
  scenarios: { stem: string; correct_key: string }[],
  client: Anthropic,
  model: string,
  callOptions: object = {}
): Promise<string[]> {
  const message = `LEAD-IN: ${leadIn}\n\nOPTIONS:\n${options.map((o) => `${o.key}. ${o.text}`).join("\n")}\n\nSCENARIOS:\n${scenarios
    .map((s, i) => `${i + 1}. ${s.stem}\nAnswer: ${s.correct_key}`)
    .join("\n\n")}`;
  try {
    const response = await client.messages.create(
      { model, max_tokens: 600, system: LIST_PROMPT, messages: [{ role: "user", content: message }] },
      callOptions
    );
    const block = response.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const found = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { faults?: Fault[] };
    return (found.faults ?? []).flatMap((f) => {
      const n = Number(f.scenario);
      if (!scenarios[n - 1]) return [];
      const kind = typeof f.kind === "string" ? f.kind : "that kind";
      return [`scenario ${n}: the answer is the only option of its kind (${kind}), so it can be spotted without the medicine. Add another option of the same kind that is wrong for every scenario, in place of one no scenario uses.`];
    });
  } catch {
    return [];
  }
}
