// A correction to a decision aid changes what it lists and nothing else, and reports exactly that.
import assert from "node:assert/strict";
import { applyAidPatch, type AidPatch } from "../src/lib/decision-aid-patch";
import type { AidContent } from "../src/lib/decision-aid-shape";

const chart: AidContent = {
  nodes: [
    { id: "1", text: "At booking", kind: "start" },
    { id: "2", text: "Antibody screen positive", kind: "question" },
    { id: "11", text: "Clinically significant antibodies", kind: "outcome" },
  ],
  edges: [{ from: "1", to: "2" }, { from: "2", to: "11", label: "Yes" }],
  footnotes: ["First note", "Second note"],
};
const table: AidContent = { columns: ["A", "B"], rows: [["a1", "b1"], ["a2", "b2"], ["a3", "b3"]], footnotes: [] };

const ok = (c: AidContent, p: AidPatch, title = "Title") => {
  const r = applyAidPatch(c, title, p);
  assert.ok(!("error" in r), "error" in r ? r.error : "");
  return r as Exclude<typeof r, { error: string }>;
};
const fails = (c: AidContent, p: AidPatch) => assert.ok("error" in applyAidPatch(c, "Title", p));

// One arrow, as in the owner's note on #570: everything else identical.
{
  const r = ok(chart, { add_edges: [{ from: "11", to: "2" }] });
  assert.deepEqual(r.content.nodes, chart.nodes);
  assert.deepEqual(r.content.edges, [...chart.edges!, { from: "11", to: "2" }]);
  assert.deepEqual(r.content.footnotes, chart.footnotes);
  assert.deepEqual(r.changes, ["Arrow added from 11 to 2."]);
}

// The input is not altered.
{
  const copy = JSON.parse(JSON.stringify(chart));
  ok(chart, { change_nodes: [{ id: "1", text: "Changed" }], remove_nodes: ["11"], add_edges: [{ from: "2", to: "1" }] });
  assert.deepEqual(chart, copy);
}

// A label changes by removing and adding the arrow.
{
  const r = ok(chart, { remove_edges: [{ from: "2", to: "11" }], add_edges: [{ from: "2", to: "11", label: "No" }] });
  assert.deepEqual(r.content.edges, [{ from: "1", to: "2" }, { from: "2", to: "11", label: "No" }]);
}

// New boxes can be joined up in the same correction; a removed box takes its arrows.
{
  const r = ok(chart, { add_nodes: [{ id: "12", text: "New", kind: "action" }], add_edges: [{ from: "11", to: "12" }] });
  assert.equal(r.content.nodes!.length, 4);
  const cut = ok(chart, { remove_nodes: ["11"] });
  assert.deepEqual(cut.content.edges, [{ from: "1", to: "2" }]);
}

// Something already there is no change, so a correction that repeats the aid reports none.
assert.deepEqual(ok(chart, { add_edges: [{ from: "1", to: "2" }], change_nodes: [{ id: "1", text: "At booking" }] }).changes, []);

// Tables: rows count from 1, on the numbering the model was shown.
{
  const r = ok(table, { change_cells: [{ row: 2, column: 2, text: "new" }], remove_rows: [1], add_rows: [{ after: 3, cells: ["a4", "b4"] }, { after: 0, cells: ["top", "top"] }] });
  assert.deepEqual(r.content.rows, [["top", "top"], ["a2", "new"], ["a3", "b3"], ["a4", "b4"]]);
  assert.deepEqual(table.rows![1], ["a2", "b2"]);
  assert.deepEqual(r.content.columns, ["A", "B"]);
}

// Footnotes and the title.
{
  const r = ok(chart, { change_footnotes: [{ number: 2, text: "Changed" }], remove_footnotes: [1], add_footnotes: ["Third"], title: "New title" });
  assert.deepEqual(r.content.footnotes, ["Changed", "Third"]);
  assert.equal(r.title, "New title");
  assert.equal(ok(chart, { title: "Title" }).title, undefined);
}

// Anything aimed at what is not there is refused, never guessed at.
fails(chart, { add_edges: [{ from: "11", to: "99" }] });
fails(chart, { remove_edges: [{ from: "1", to: "11" }] });
fails(chart, { change_nodes: [{ id: "99", text: "x" }] });
fails(chart, { remove_nodes: ["99"] });
fails(chart, { add_nodes: [{ id: "1", text: "x", kind: "action" }] });
fails(table, { change_cells: [{ row: 4, column: 1, text: "x" }] });
fails(table, { change_cells: [{ row: 1, column: 3, text: "x" }] });
fails(table, { remove_rows: [9] });
fails(table, { add_rows: [{ after: 9, cells: ["x", "y"] }] });
fails(chart, { change_footnotes: [{ number: 3, text: "x" }] });

console.log("aid corrections: all passed");
