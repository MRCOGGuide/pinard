/**
 * Grouping the failure log, against what is actually in it.
 *
 *   npx tsx scripts/test-failures.mts
 */

import {
  failureKind,
  failureSignature,
  groupFailures,
  type FailureRecord,
} from "../src/lib/failures";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}

// The four shapes the table actually holds today.
check(
  "an organization on hold is a service fault",
  failureKind(
    'API error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"This organization has been disabled."}}'
  ),
  "service"
);
check(
  "a search that timed out is a service fault",
  failureKind(
    "chat: retrieval failed — match_chunks failed: canceling statement due to statement timeout (ask box)"
  ),
  "service"
);
check(
  "an unreachable model is a service fault",
  failureKind("chat: model call failed — fetch failed (ask box)"),
  "service"
);
check(
  "a question that would not ground is a verification failure",
  failureKind("the stem's subject is a study, not a patient — rewrite it"),
  "verification"
);
check(
  "an unrecognised reason is still shown",
  failureKind("something nobody has seen before"),
  "other"
);

// Request ids differ on every occurrence of one fault.
const a =
  'API error: 400 {"error":{"message":"disabled"},"request_id":"req_011Ceu3he1fT4kAPfT6X4Dz3"}';
const b =
  'API error: 400 {"error":{"message":"disabled"},"request_id":"req_011Ceu3hd47nH3BB89kMhzxG"}';
check("two of the same fault share a signature", failureSignature(a) === failureSignature(b), true);

const rows: FailureRecord[] = [
  ...Array.from({ length: 390 }, (_, i) => ({
    id: i + 1,
    reason: `API error: 400 {"error":{"message":"This organization has been disabled."},"request_id":"req_${i}"}`,
    format: null,
    created_at: "2026-09-10T03:27:00.000Z",
    sections: null,
  })),
  {
    id: 900,
    reason:
      "chat: retrieval failed — match_chunks failed: canceling statement due to statement timeout (ask box)",
    format: null,
    created_at: "2026-09-11T00:29:55.000Z",
    sections: null,
  },
  {
    id: 901,
    reason: "the stem's subject is a study, not a patient — rewrite it",
    format: "sba",
    created_at: "2026-09-08T10:00:00.000Z",
    sections: { title: "Contraception" },
  },
];

const groups = groupFailures(rows);
check("391 service rows collapse to two groups plus one", groups.length, 3);
check("the 390 identical ones become one line", groups[0].count + groups[1].count, 391);
check(
  "service faults come before verification ones",
  groups.map((g) => g.kind),
  ["service", "service", "verification"]
);
check(
  "the retrieval timeout is first, being the most recent service fault",
  groups[0].ids,
  [900]
);
check(
  "resolving a group resolves every row in it",
  groups.find((g) => g.count === 390)?.ids.length,
  390
);
check(
  "the headline drops the JSON",
  groups.find((g) => g.count === 390)?.headline,
  "This organization has been disabled."
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
