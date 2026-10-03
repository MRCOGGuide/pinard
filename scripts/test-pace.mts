/**
 * "Am I on track?" in one line.
 *
 *   npx tsx scripts/test-pace.mts
 *
 * The line is division, and the tone is flat on purpose: a candidate
 * with eleven topics and twelve days does not need to be told they are
 * behind, they need to see one topic a day. These check that it says
 * the right thing at the edges — nothing left to do, no date set, the
 * date already gone — rather than printing a number that reads as a
 * verdict.
 */
import { pace, nextMilestone, milestoneLabel } from "../src/lib/pace";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
    failed += 1;
  }
}

const p = (secured: number, total: number, daysRemaining: number | null) =>
  pace({ secured, total, daysRemaining });

check("plenty of room", p(20, 35, 90).standing, "comfortable");
check("and it says the rate", p(20, 35, 90).sentence,
  "15 topics to bring up to 70%, 90 days left: about 6 days for each.");

check("tight", p(20, 35, 40).standing, "tight");
check("very tight", p(5, 35, 20).standing, "very tight");
check("under a day each is said as such", p(5, 35, 20).sentence,
  "30 topics to bring up to 70%, 20 days left: more than one a day.");

check("one topic, one day, singular throughout", p(34, 35, 1).sentence,
  "1 topic to bring up to 70%, 1 day left: about 1 day for each.");

check("nothing left to secure", p(35, 35, 30).standing, "done");
check("and it does not print a rate", p(35, 35, 30).daysEach, null);

check("the date has gone", p(10, 35, 0).standing, "very tight");
check("no date set at all", p(10, 35, null).standing, "no date");
check("no topics yet", p(0, 0, 30).standing, "no date");

/* A decimal rate reads as a decimal, not as 4.000000001. */
check("a fractional rate is one decimal", p(28, 35, 17).sentence,
  "7 topics to bring up to 70%, 17 days left: about 2.4 days for each.");

/* ---- what they are working towards ---- */
const next = (secured: number, total: number, streak: number) =>
  nextMilestone({ secured, total, streak });

check("nothing secured yet", next(0, 35, 0), { label: "your first topic at 70%", remaining: 1 });
check("working towards half", next(5, 35, 0), { label: "half the syllabus secure", remaining: 13 });
check("past half, working towards all", next(30, 35, 0), { label: "every topic secure", remaining: 5 });
check("all secured, now the streak", next(35, 35, 0), { label: "3 days running", remaining: 3 });
check("a streak already past three", next(35, 35, 5), { label: "7 days running", remaining: 2 });
check("nothing left to chase", next(35, 35, 30), null);

/* ---- how a milestone reads on a screen ---- */
check("the diagnostic", milestoneLabel("milestone:diagnostic"), "Diagnostic done, plan live");
check("the first topic", milestoneLabel("milestone:first-topic"), "First topic at 70%");
check("half the syllabus", milestoneLabel("milestone:half-syllabus"), "Half the syllabus secure");
check("a streak reads its own length", milestoneLabel("milestone:streak-14"), "14 days running");
check("anything else is not shown", milestoneLabel("milestone:something-new"), null);
check("a reminder is not a milestone", milestoneLabel("daily-reminder"), null);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
