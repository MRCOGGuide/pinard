/**
 * Telling the model's limits from other failures, and how long a job waits.
 *
 *   npx tsx --conditions=react-server scripts/test-model-limit.mts
 */
import assert from "node:assert/strict";
import { limitIn, stillWaiting, waitingMessage, WAITING_BRIEF, WAITING_DAILY } from "../src/lib/queue";

assert.equal(limitIn("API error: 429 Too many tokens per day, please wait before trying again."), "daily");
assert.equal(limitIn("API error: 429 Too many requests, please wait before trying again."), "brief");
assert.equal(limitIn("verification failed after 3 attempts: option E runs to 13 words"), null);
assert.equal(limitIn("the explanation states \"4290\", which no cited passage gives"), null, "a number that contains 429 is not a limit");

assert.equal(waitingMessage("daily"), WAITING_DAILY);
assert.equal(waitingMessage("brief"), WAITING_BRIEF);

const at = (minutesAgo: number, last_error: string | null) => ({ last_error, updated_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() });
assert.equal(stillWaiting(at(29, WAITING_DAILY)), true);
assert.equal(stillWaiting(at(31, WAITING_DAILY)), false);
assert.equal(stillWaiting(at(2, WAITING_BRIEF)), true);
assert.equal(stillWaiting(at(4, WAITING_BRIEF)), false);
assert.equal(stillWaiting(at(0, null)), false, "a job with nothing to wait for does not wait");
assert.equal(stillWaiting(at(0, "no questions produced")), false);

console.log("model limit: all passed");
