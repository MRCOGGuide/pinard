// Options in the order a paper prints them, risks read by their size (owner, 9 November 2026, on #2424).
// Usage: npx tsx --conditions=react-server scripts/test-option-order.mts
const { orderOptions, optionSize } = await import("../src/lib/generation");

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};
const order = (texts: string[]) =>
  orderOptions(texts.map((text, i) => ({ key: String.fromCharCode(65 + i), text }))).options.map((o) => o.text);

check("#2424's list reads by size, not alphabetically",
  order(["1 in 10 000", "1 in 20", "1 in 2500", "1 in 50", "1 in 500"]),
  ["1 in 20", "1 in 50", "1 in 500", "1 in 2500", "1 in 10 000"]);
check("digits grouped by a comma",
  order(["1 in 1,000", "1 in 10,000", "1 in 100", "1 in 5,000", "1 in 500"]),
  ["1 in 100", "1 in 500", "1 in 1,000", "1 in 5,000", "1 in 10,000"]);
check("digits grouped by a space",
  order(["1 in 1 000", "1 in 10 000", "1 in 100 000", "1 in 5 000", "1 in 50 000"]),
  ["1 in 1 000", "1 in 5 000", "1 in 10 000", "1 in 50 000", "1 in 100 000"]);
check("a list already in order stays",
  order(["1 in 2", "1 in 3", "1 in 4", "1 in 5", "1 in 6"]),
  ["1 in 2", "1 in 3", "1 in 4", "1 in 5", "1 in 6"]);
check("several in the same number read by their size",
  order(["4 in 5", "1 in 5", "3 in 5", "5 in 5", "2 in 5"]),
  ["1 in 5", "2 in 5", "3 in 5", "4 in 5", "5 in 5"]);
check("ratios and percentages side by side",
  order(["25%", "1 in 10", "2 in 100", "50%", "1 in 3"]),
  ["2 in 100", "1 in 10", "25%", "1 in 3", "50%"]);
check("plain numbers unchanged",
  order(["10 mg", "9 mg", "100 mg", "1 mg", "50 mg"]),
  ["1 mg", "9 mg", "10 mg", "50 mg", "100 mg"]);
check("gestations unchanged",
  order(["37 weeks", "34 weeks", "39 weeks", "28 weeks", "32 weeks"]),
  ["28 weeks", "32 weeks", "34 weeks", "37 weeks", "39 weeks"]);
check("words still alphabetical",
  order(["Non-rotational forceps", "Kielland's rotational forceps", "Soft-cup vacuum extraction", "Manual rotation, then direct traction forceps", "Rigid-cup vacuum extraction"]),
  ["Kielland's rotational forceps", "Manual rotation, then direct traction forceps", "Non-rotational forceps", "Rigid-cup vacuum extraction", "Soft-cup vacuum extraction"]);
check("a range reads by its lower end", optionSize("1–4 in 1000"), 0.001);
check("a percentage range sits among percentages",
  order(["Less than 1%", "3–6%", "Approximately 3%", "4%", "85–90%", "77%", "92%"]),
  ["Less than 1%", "3–6%", "Approximately 3%", "4%", "77%", "85–90%", "92%"]);
check("a percentage with a ratio after it reads by the percentage",
  order(["Approximately 7% (1 in 14)", "Approximately 14% (1 in 7)", "Approximately 33% (1 in 3)", "Approximately 16% (1 in 6)", "Approximately 23% (1 in 4)"]),
  ["Approximately 7% (1 in 14)", "Approximately 14% (1 in 7)", "Approximately 16% (1 in 6)", "Approximately 23% (1 in 4)", "Approximately 33% (1 in 3)"]);
check("titres read by their dilution", order(["≥1:16", "≥1:2", "≥1:32", "≥1:4", "≥1:8"]), ["≥1:2", "≥1:4", "≥1:8", "≥1:16", "≥1:32"]);
check("doses with grouped digits", order(["10 000 iu twice daily", "12 000 iu twice daily", "20 000 iu once daily", "6000 iu twice daily", "8000 iu twice daily"]),
  ["6000 iu twice daily", "8000 iu twice daily", "10 000 iu twice daily", "12 000 iu twice daily", "20 000 iu once daily"]);
check("per 100 000", optionSize("1.7 per 100 000"), 0.000017);
check("a ratio with a percentage after it", optionSize("1 in 4 (25%)"), 0.25);
check("10,000 is one number", optionSize("10,000 units"), 10000);
check("no number", optionSize("Expectant management"), null);
check("the answer's letter follows it", (() => {
  const { options, remap } = orderOptions([
    { key: "A", text: "1 in 10 000" }, { key: "B", text: "1 in 20" }, { key: "C", text: "1 in 2500" },
    { key: "D", text: "1 in 50" }, { key: "E", text: "1 in 500" },
  ]);
  return { answer: remap.get("B"), text: options.find((o) => o.key === remap.get("B"))?.text };
})(), { answer: "A", text: "1 in 20" });

console.log(failed ? `${failed} failed` : "option order: all passed");
if (failed) process.exit(1);
