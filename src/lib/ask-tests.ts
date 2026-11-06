import "server-only";
import { answerFromLibrary, type AskTrace } from "@/lib/chat-service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The fixed test set (owner's brief, part 8): the same questions, asked
 * again after every change, with the answers side by side for the owner to
 * judge. Admin > Ask tests runs it.
 *
 * The questions are kept in Storage (ask-tests/set.json) because this
 * repository is public. Each answer goes in ask_reviews, where it can be
 * rated like any other test, and leaves a small file of its own in the
 * run's folder. Never one shared file: Storage can show a rewritten file
 * old for over a minute, and a new file at once.
 */

export type TestQuestion = { label: string; question: string };
export type TestResult = TestQuestion & { n: number; review_id: number | null; first_ms: number | null; planned: boolean };
export type TestRun = { id: string; results: TestResult[] };

const RUNS = "ask-tests/runs";
/** At once: the planner's rate limit refused four, and three fit nine questions well inside the route's 300 seconds. */
const AT_ONCE = 3;
const STAGGER_MS = 1500;

const storage = () => createAdminClient().storage.from("sources");

async function readJson<T>(path: string): Promise<T | null> {
  const { data } = await storage().download(path);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

export const readTestSet = async () => (await readJson<TestQuestion[]>("ask-tests/set.json")) ?? [];

/** A run's id is the time it started, in a form that sorts and can be a folder's name. */
export const newRunId = () => new Date().toISOString().slice(0, 19).replace(/:/g, "-");
export const runStarted = (id: string) => new Date(`${id.slice(0, 10)}T${id.slice(11).replace(/-/g, ":")}Z`);

export async function resultsSoFar(run: string): Promise<number> {
  const { data } = await storage().list(`${RUNS}/${run}`, { limit: 100 });
  return (data ?? []).filter((file) => file.name.endsWith(".json")).length;
}

/** Newest first. */
export async function latestRuns(count = 2): Promise<TestRun[]> {
  const { data } = await storage().list(RUNS, { limit: 200, sortBy: { column: "name", order: "desc" } });
  const ids = (data ?? []).map((folder) => folder.name).filter((name) => /^\d{4}-/.test(name)).slice(0, count);
  return Promise.all(
    ids.map(async (id) => {
      const { data: files } = await storage().list(`${RUNS}/${id}`, { limit: 100 });
      const results = await Promise.all((files ?? []).map((file) => readJson<TestResult>(`${RUNS}/${id}/${file.name}`)));
      return { id, results: results.filter((r): r is TestResult => Boolean(r)).sort((a, b) => a.n - b.n) };
    })
  );
}

async function answerOne(run: string, n: number, item: TestQuestion, userId: string | null): Promise<void> {
  const trace: AskTrace = { retrievalMs: 0, modelMs: [], problems: [], passages: [] };
  const started = Date.now();
  let first: number | null = null;
  const outcome = await answerFromLibrary({
    history: [],
    message: item.question,
    trace,
    onEvent: (event) => {
      if ("lines" in event && event.lines.length) first ??= Date.now() - started;
    },
  }).catch((error) => ({ ok: false as const, reason: String(error), raw: "", kind: "unavailable" as const }));
  const { data } = await createAdminClient()
    .from("ask_reviews")
    .insert({
      created_by: userId,
      question: item.question,
      reply: outcome.ok ? outcome.reply : null,
      sources: outcome.ok ? outcome.sources : [],
      passages: trace.passages,
      retrieval_ms: trace.retrievalMs,
      total_ms: Date.now() - started,
      attempts: trace.modelMs.length,
      problems: trace.problems,
      ok: outcome.ok,
      failure: outcome.ok ? null : outcome.reason,
    })
    .select("id")
    .single();
  const result: TestResult = { ...item, n, review_id: data?.id ?? null, first_ms: first, planned: outcome.ok ? outcome.planned !== false : false };
  await storage().upload(`${RUNS}/${run}/${String(n).padStart(2, "0")}.json`, new Blob([JSON.stringify(result)], { type: "application/json" }), {
    contentType: "application/json",
  });
}

/** Asks every question, a few at a time. Gaps are not logged: these are the same questions each time. */
export async function runTests(run: string, userId: string | null): Promise<void> {
  const set = await readTestSet();
  let next = 0;
  const asker = async (place: number) => {
    await new Promise((done) => setTimeout(done, place * STAGGER_MS));
    while (next < set.length) {
      const n = next++;
      await answerOne(run, n + 1, set[n], userId);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, (_, place) => asker(place)));
}
