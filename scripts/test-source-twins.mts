/**
 * Telling one document held twice.
 *
 *   npx tsx --conditions=react-server scripts/test-source-twins.mts
 */
import assert from "node:assert/strict";
import { openingKey, twinsByKey } from "../src/lib/source-twins";

assert.deepEqual(
  twinsByKey([
    { id: 1, key: "a" },
    { id: 2, key: "b" },
    { id: 3, key: "a" },
    { id: 4, key: null },
    { id: 5, key: undefined },
    { id: 6, key: "a" },
  ]),
  { 1: [3, 6], 3: [1, 6], 6: [1, 3] }
);
assert.deepEqual(twinsByKey([{ id: 1, key: null }, { id: 2, key: null }]), {}, "sources with nothing to go on are not twins");

const long = "Pregnancy and heart disease. ".repeat(30);
assert.equal(openingKey(long), openingKey(long.toUpperCase().replace(/ /g, "  ")), "case and spacing do not matter");
assert.equal(openingKey(long), openingKey(`${long}and some more at the end`), "only the opening counts");
assert.notEqual(openingKey(long), openingKey(`A different opening. ${long}`));
assert.equal(openingKey("Too short to tell by."), null);

console.log("source twins: all passed");
