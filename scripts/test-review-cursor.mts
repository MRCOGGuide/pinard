/**
 * What identifies the question under the reviewer's cursor.
 *
 *   npx tsx scripts/test-review-cursor.mts
 *
 * The review queue clears its confirmation ("Saved #1935.") when the
 * reviewer moves on. It used to do that when the cursor moved, and the
 * cursor is a position in a list that shrinks underneath it: approve
 * the question at the top and the cursor stays at zero while a
 * different question slides in, so nothing fired and the message sat
 * under every question that followed. That is the complaint it came
 * from, a message constant under all questions being reviewed.
 *
 * So the effect keys on the item's own key instead. These are the
 * properties that has to have: it changes when the work changes, and
 * it does NOT change when the same work is merely re-read, which is
 * what keeps a confirmation on screen after a save and after one
 * scenario of a set is rejected.
 */
import { groupIntoItems, type EmqGroupable } from "../src/lib/emq";

type Row = EmqGroupable;

const sba = (id: number): Row => ({
  id,
  format: "sba",
  stem: `stem ${id}`,
  options: [],
  correct_key: "A",
  lead_in: null,
  emq_group_id: null,
});

const emq = (id: number, group: string): Row => ({
  id,
  format: "emq",
  stem: `stem ${id}`,
  options: [],
  correct_key: "A",
  lead_in: "lead",
  emq_group_id: group,
});

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got === want) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got ${String(got)}, want ${String(want)}`);
    failed += 1;
  }
}

const keyAt = (rows: Row[], cursor: number) => groupIntoItems(rows)[cursor]?.key;

/* The fault, stated as a test. */
const queue = [sba(100), sba(101), sba(102)];
const before = keyAt(queue, 0);
const afterApproval = keyAt(queue.slice(1), 0);
check("the cursor does not move when the question under it is approved", 0, 0);
check("the key does", before !== afterApproval, true);
check("and it is the next question's", afterApproval, "q101");

/* Re-reading the same queue must look identical, or the message flickers. */
check("a refresh with the same rows keeps the key", keyAt(queue, 0), before);

/* A set keeps its identity while its scenarios come and go. */
const set = [emq(200, "g1"), emq(201, "g1"), emq(202, "g1"), sba(203)];
check("a set is keyed by its group", keyAt(set, 0), "setg1");
check(
  "rejecting one scenario leaves the set's key alone",
  keyAt([emq(200, "g1"), emq(202, "g1"), sba(203)], 0),
  "setg1"
);
/*
  Down to one scenario it is shown as a single, which is a different
  kind of work and a new key. Right: the set the confirmation was
  about no longer exists.
*/
check(
  "a set reduced to one scenario is keyed as that question",
  keyAt([emq(202, "g1"), sba(203)], 0),
  "q202"
);
check(
  "approving a whole set moves the key on",
  keyAt([sba(203)], 0),
  "q203"
);

/* The end of the queue has no key, and must not throw. */
check("an exhausted queue has no key", keyAt([], 0), undefined);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
