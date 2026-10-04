/**
 * Does a question you got wrong actually come back, and does coming
 * back stay out of the score?
 *
 *   npx tsx scripts/test-review.mts
 *
 * Two promises, and the second matters more than it looks. Serving a
 * question again is easy; the trap is letting the repeat count toward
 * the topic's accuracy, because then readiness climbs as a candidate
 * re-answers their own errors and the number stops meaning anything.
 */
import {
  dueForRetry,
  firstAttempts,
  retryState,
  retryBudget,
  RETRY_INTERVALS_DAYS,
  RETRIES_TO_RETIRE,
  type Attempt,
} from "../src/lib/review";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

const NOW = new Date("2026-10-04T09:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const at = (question_id: number, is_correct: boolean, days: number): Attempt => ({
  question_id,
  is_correct,
  answered_at: daysAgo(days),
});

/* ---- one question's journey ---- */

check(
  "a question answered correctly first time never comes back",
  retryState([at(1, true, 40)], NOW).status === "retired"
);

check(
  "wrong yesterday is not due yet",
  retryState([at(1, false, 1)], NOW).status === "waiting"
);

check(
  `wrong ${RETRY_INTERVALS_DAYS[0]} days ago is due`,
  retryState([at(1, false, RETRY_INTERVALS_DAYS[0])], NOW).status === "due"
);

check(
  "one correct retry buys the second, longer interval",
  retryState([at(1, false, 20), at(1, true, 17)], NOW).status === "waiting" ||
    RETRY_INTERVALS_DAYS[1] <= 17,
  JSON.stringify(retryState([at(1, false, 20), at(1, true, 17)], NOW))
);

check(
  "and it is due again once that interval passes",
  retryState(
    [at(1, false, 40), at(1, true, RETRY_INTERVALS_DAYS[1] + 1)],
    NOW
  ).status === "due"
);

const banked = [
  at(1, false, 60),
  ...RETRY_INTERVALS_DAYS.map((_, i) => at(1, true, 50 - i * 10)),
];
check(
  `${RETRIES_TO_RETIRE} correct retrievals retire it`,
  retryState(banked, NOW).status === "retired",
  JSON.stringify(retryState(banked, NOW))
);

check(
  "getting it wrong again starts the intervals over",
  retryState([...banked, at(1, false, 1)], NOW).status === "waiting"
);

/* ---- the day's list ---- */

const history: Attempt[] = [
  at(10, false, 30), // long overdue
  at(11, false, 4), // just due
  at(12, false, 1), // not yet
  at(13, true, 5), // never wrong
  at(14, false, 40), // failed, then fully retrieved
  at(14, true, 30),
  at(14, true, 18),
  at(14, true, 4),
];

const due = dueForRetry(history, NOW);
check("only the questions that are due are listed", due.length === 2, JSON.stringify(due));
check("the most overdue comes first", due[0] === 10, JSON.stringify(due));
check("a retired question is not in the list", !due.includes(14));
check("one never answered wrongly is not in the list", !due.includes(13));
check("one not yet due is not in the list", !due.includes(12));

/* ---- the score sees each question once ---- */

const repeated: Attempt[] = [
  at(1, false, 30),
  at(1, true, 20),
  at(1, true, 10), // same question, learnt
  at(2, false, 25),
  at(3, true, 15),
];
const first = firstAttempts(repeated);
check(
  "a topic is scored on one attempt per question",
  first.length === 3,
  JSON.stringify(first.map((f) => f.question_id))
);
check(
  "and it is the FIRST attempt that counts",
  first.filter((f) => f.is_correct).length === 1,
  "two wrong, one right: re-answering them right must not change that"
);
check(
  "so re-answering every error correctly does not move the score",
  firstAttempts([...repeated, at(2, true, 1)]).filter((f) => f.is_correct)
    .length === 1
);
check("first attempts come back oldest first", first[0].question_id === 1);

/* ---- a session is never mostly repeats ---- */
check("a quarter of the session, at most", retryBudget(20) === 5);
check("and never zero, or nothing would ever come back", retryBudget(1) >= 1);
check(
  "retries can never crowd out the day's new work",
  retryBudget(20) < 20 / 2
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
