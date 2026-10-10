import type { Section } from "@/lib/types";

/**
 * The diagnostics: what each one asks, and what it is allowed to claim.
 *
 * Two of them (owner's decision, 10 October 2026):
 *
 *   - The free sample diagnostic: one question from each section, at
 *     most 35, about three in four a single best answer and one in four
 *     an EMQ scenario, at mixed difficulty. The questions are FIXED, the same for
 *     every free candidate, chosen once by scripts/pick-free-diagnostic
 *     and pinned in the database (phase46). A free account can read
 *     those and the fifteen sample questions, and nothing else of the
 *     bank, so sitting it again, or from many accounts, shows the same
 *     handful rather than the bank.
 *
 *   - The full diagnostic, for subscribers: two SBAs and one EMQ set from
 *     every section, picked fresh, unseen first, at mixed difficulty.
 *
 * The summary of a free sitting reports a score per module and names
 * the sections missed WITHOUT calling them weak: one question cannot
 * establish that.
 *
 * Pure: no database, so the rules above can be tested.
 */

/** A question as the pickers need it. */
export type PoolQuestion = {
  id: number;
  sectionId: number;
  format: "sba" | "emq";
  difficulty: number | null;
  /** EMQ only: the set it belongs to. */
  groupId: string | null;
};

/** What one section contributes: an SBA, one EMQ scenario, or (full diagnostic) a set. */
export type PickedItem = { sectionId: number; kind: "sba" | "emq"; ids: number[] };

/** One in four questions in the free diagnostic is an EMQ. */
export const FREE_EMQ_SHARE = 0.25;

/* Difficulty, 1 (easiest) to 5, walked in this order down the paper so
   neighbouring sections do not all sit at the same level. */
const FREE_DIFFICULTY_CYCLE = [3, 2, 4, 3, 1, 4, 2, 5, 3, 4, 2, 3];

type EmqSet = { groupId: string; ids: number[]; difficulty: number };

function setsOf(questions: PoolQuestion[]): EmqSet[] {
  const groups = new Map<string, PoolQuestion[]>();
  for (const q of questions) {
    if (q.format !== "emq" || !q.groupId) continue;
    const g = groups.get(q.groupId);
    if (g) g.push(q);
    else groups.set(q.groupId, [q]);
  }
  return Array.from(groups.entries()).map(([groupId, qs]) => {
    qs.sort((a, b) => a.id - b.id);
    const mean = qs.reduce((n, q) => n + (q.difficulty ?? 3), 0) / qs.length;
    return { groupId, ids: qs.map((q) => q.id), difficulty: mean };
  });
}

const gap = (difficulty: number | null, target: number) => Math.abs((difficulty ?? 3) - target);

/**
 * The fixed free diagnostic, from the bank as it stands (owner's
 * decision, 10 October 2026): at most one question from a section and
 * at most FREE_DIAGNOSTIC_MAX in all.
 *
 * Sections come in syllabus order and each gives ONE question. About one
 * in four is an EMQ, shown as a single scenario with its full option list
 * rather than as a whole set, so the sitting stays short and shows as
 * little of the bank as possible. Every fourth section takes the EMQ
 * turn; where that section has no EMQ, the next one that has takes it, so
 * the share holds. The question nearest the difficulty that position
 * calls for is taken. Deterministic: the same bank gives the same paper.
 *
 * If there are more sections than the limit, the sections named in
 * `dropFirst` are left out first, in that order (the caller passes the
 * last of the governance sections), then any from the end.
 *
 * `exclude` keeps out questions shown elsewhere for free (the fifteen
 * sample questions and the public sample page): the diagnostic should
 * not be answerable from having just practised it.
 */
export const FREE_DIAGNOSTIC_MAX = 35;

export function pickFreeDiagnostic(
  sectionOrder: number[],
  pool: PoolQuestion[],
  exclude: Set<number>,
  options: { max?: number; dropFirst?: number[] } = {}
): PickedItem[] {
  const max = options.max ?? FREE_DIAGNOSTIC_MAX;
  const bySection = new Map<number, PoolQuestion[]>();
  for (const q of pool) {
    if (exclude.has(q.id)) continue;
    const list = bySection.get(q.sectionId);
    if (list) list.push(q);
    else bySection.set(q.sectionId, [q]);
  }

  let sections = sectionOrder.filter((id) => (bySection.get(id) ?? []).length > 0);
  for (const id of options.dropFirst ?? []) {
    if (sections.length <= max) break;
    sections = sections.filter((s) => s !== id);
  }
  sections = sections.slice(0, max);

  const emqTarget = Math.round(sections.length * FREE_EMQ_SHARE);
  let emqOwed = 0;
  let emqTaken = 0;
  const picked: PickedItem[] = [];
  const nearest = (list: PoolQuestion[], target: number) =>
    [...list].sort((a, b) => gap(a.difficulty, target) - gap(b.difficulty, target) || a.id - b.id)[0];

  sections.forEach((sectionId, i) => {
    const questions = bySection.get(sectionId) ?? [];
    const target = FREE_DIFFICULTY_CYCLE[i % FREE_DIFFICULTY_CYCLE.length];
    if (i % 4 === 3) emqOwed += 1;

    const emqs = questions.filter((q) => q.format === "emq");
    const sbas = questions.filter((q) => q.format === "sba");
    const wantEmq = (emqOwed > 0 && emqTaken < emqTarget) || sbas.length === 0;
    if (wantEmq && emqs.length > 0) {
      picked.push({ sectionId, kind: "emq", ids: [nearest(emqs, target).id] });
      if (emqOwed > 0) emqOwed -= 1;
      emqTaken += 1;
      return;
    }
    if (sbas.length > 0) picked.push({ sectionId, kind: "sba", ids: [nearest(sbas, target).id] });
  });
  return picked;
}

/**
 * One section of the full diagnostic: two SBAs and one EMQ set.
 *
 * The two SBAs sit at different levels: one from the easier end of what
 * the section holds, one from the harder. The set is the shortest the
 * section has, then the one nearest the middle difficulty. Questions this
 * candidate has not seen come first, and `random` breaks ties, so two
 * sittings are not the same paper. A section with no EMQ set gives a
 * third SBA, from the middle, instead.
 */
export function pickFullDiagnosticSection(
  questions: PoolQuestion[],
  seen: Set<number>,
  random: () => number = Math.random
): number[] {
  function shuffled<T>(list: T[]): T[] {
    return list
      .map((v) => ({ v, r: random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.v);
  }
  function freshFirst<T extends { fresh: boolean }>(list: T[]): T[] {
    return list.some((x) => x.fresh) ? list.filter((x) => x.fresh) : list;
  }
  const level = (q: { difficulty: number | null }) => q.difficulty ?? 3;

  const sbas = freshFirst(
    shuffled(questions.filter((q) => q.format === "sba")).map((q) => ({ ...q, fresh: !seen.has(q.id) }))
  );
  const ids: number[] = [];
  if (sbas.length > 0) {
    const easy = [...sbas].sort((a, b) => level(a) - level(b))[0];
    ids.push(easy.id);
    const rest = sbas.filter((q) => q.id !== easy.id);
    if (rest.length > 0) {
      // Harder than the first, if the section holds anything harder.
      ids.push([...rest].sort((a, b) => level(b) - level(a))[0].id);
    }
  }

  const sets = freshFirst(
    shuffled(setsOf(questions)).map((s) => ({ ...s, fresh: s.ids.every((id) => !seen.has(id)) }))
  ).sort((a, b) => a.ids.length - b.ids.length || gap(a.difficulty, 3) - gap(b.difficulty, 3));
  if (sets.length > 0) {
    ids.push(...sets[0].ids);
  } else {
    const middle = sbas
      .filter((q) => !ids.includes(q.id))
      .sort((a, b) => gap(a.difficulty, 3) - gap(b.difficulty, 3))[0];
    if (middle) ids.push(middle.id);
  }
  return ids;
}

/** How long a sitting should take: one to two minutes a question. */
export type TimeEstimate = {
  questions: number;
  sbas: number;
  emqScenarios: number;
  emqSets: number;
  minMinutes: number;
  maxMinutes: number;
};

export function timeEstimate(
  questions: { id: number; format: string; emq_group_id: string | null }[]
): TimeEstimate {
  const emq = questions.filter((q) => q.format === "emq");
  return {
    questions: questions.length,
    sbas: questions.length - emq.length,
    emqScenarios: emq.length,
    emqSets: new Set(emq.map((q) => q.emq_group_id ?? `solo-${q.id}`)).size,
    minMinutes: questions.length,
    maxMinutes: questions.length * 2,
  };
}

/** "45 minutes", "1 hour 10 minutes", "3 hours". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? "" : `${h} hour${h === 1 ? "" : "s"}`;
  const mins = m === 0 ? "" : `${m} minute${m === 1 ? "" : "s"}`;
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

/**
 * The free plan preview: the same message for the same answers, with no
 * AI involved (owner's decision, 10 October 2026).
 *
 * The first fortnight goes to sections answered wrongly, in this order:
 *   1. Obstetrics or Gynaecology, where an easier question (difficulty 1
 *      or 2) was missed: an easy miss is the clearest sign of a gap;
 *   2. the rest of Obstetrics and Gynaecology, easiest miss first;
 *   3. then Governance and the high-impact papers.
 * Syllabus order breaks ties. What follows is shown blurred: the full
 * plan is for subscribers.
 */
export type PreviewAnswer = {
  sectionId: number;
  correct: boolean;
  difficulty: number | null;
};

export type PlanPreview = {
  /** Up to three section titles for the first two weeks. */
  firstFortnight: string[];
  /** What follows, in order, for the blurred part. */
  later: string[];
  allCorrect: boolean;
};

export const CLINICAL_MODULES = ["Obstetrics", "Gynaecology"];

export function freePlanPreview(answers: PreviewAnswer[], sections: Section[]): PlanPreview {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const moduleOf = (id: number) => {
    const s = byId.get(id);
    return s?.parent_id ? byId.get(s.parent_id) ?? s : s;
  };
  const position = (id: number) => (moduleOf(id)?.sort_order ?? 0) * 1000 + (byId.get(id)?.sort_order ?? 0);
  const title = (id: number) => byId.get(id)?.title ?? "";

  // Each missed section, with the easiest question missed in it.
  const missed = new Map<number, number>();
  for (const a of answers) {
    if (a.correct) continue;
    missed.set(a.sectionId, Math.min(missed.get(a.sectionId) ?? 9, a.difficulty ?? 3));
  }
  const rank = (id: number) => {
    const clinical = CLINICAL_MODULES.includes(moduleOf(id)?.title ?? "");
    if (clinical && (missed.get(id) ?? 9) <= 2) return 0;
    return clinical ? 1 : 2;
  };
  const ordered = Array.from(missed.keys()).sort(
    (a, b) =>
      rank(a) - rank(b) || (missed.get(a) ?? 9) - (missed.get(b) ?? 9) || position(a) - position(b)
  );
  const secured = Array.from(new Set(answers.map((a) => a.sectionId)))
    .filter((id) => !missed.has(id))
    .sort((a, b) => position(a) - position(b));

  return {
    firstFortnight: ordered.slice(0, 3).map(title),
    later: [...ordered.slice(3), ...secured].map(title),
    allCorrect: answers.length > 0 && missed.size === 0,
  };
}

/** Each answer as the summary needs it. */
export type DiagnosticAnswer = {
  questionId: number;
  correct: boolean;
  sectionId: number;
};

export type ModuleScore = {
  moduleId: number;
  title: string;
  correct: number;
  asked: number;
};

export type DiagnosticSummary = {
  correct: number;
  asked: number;
  /** Percentage, rounded, 0 when nothing was asked. */
  percent: number;
  modules: ModuleScore[];
  /** Sub-topics with a wrong answer, named but not judged. */
  missed: string[];
  /** Sub-topics the sitting never reached. */
  untested: number;
};

export function summariseDiagnostic(
  answers: DiagnosticAnswer[],
  sections: Section[],
  /** Every sub-topic the full syllabus holds, for the untested count. */
  allSubTopics: number
): DiagnosticSummary {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const moduleOf = (sectionId: number): Section | undefined => {
    const section = byId.get(sectionId);
    if (!section) return undefined;
    return section.parent_id ? byId.get(section.parent_id) ?? section : section;
  };

  const modules = new Map<number, ModuleScore>();
  const missed: string[] = [];

  for (const answer of answers) {
    const parent = moduleOf(answer.sectionId);
    if (parent) {
      const score = modules.get(parent.id) ?? {
        moduleId: parent.id,
        title: parent.title,
        correct: 0,
        asked: 0,
      };
      score.asked += 1;
      if (answer.correct) score.correct += 1;
      modules.set(parent.id, score);
    }
    if (!answer.correct) {
      const title = byId.get(answer.sectionId)?.title;
      if (title && !missed.includes(title)) missed.push(title);
    }
  }

  const correct = answers.filter((a) => a.correct).length;
  const touched = new Set(answers.map((a) => a.sectionId)).size;

  return {
    correct,
    asked: answers.length,
    percent: answers.length
      ? Math.round((correct / answers.length) * 100)
      : 0,
    modules: Array.from(modules.values()),
    missed,
    untested: Math.max(0, allSubTopics - touched),
  };
}

/**
 * How often the diagnostic may be sat again, and why at all.
 *
 * It was unlimited: nothing stopped a candidate retaking it twice in
 * an afternoon. That is worse than it sounds. A sitting draws one
 * unseen question per section, so repeated sittings quietly eat the
 * fresh questions the daily plan needs, and nothing can be compared
 * with anything because no two sittings are a fixed distance apart.
 *
 * The case for a repeat is not that it measures better. It measures
 * worse: readiness already reads the whole syllabus continuously, from
 * a rolling twenty answers per topic, where a diagnostic reads one.
 * Anyone expecting a second sitting to tell them more precisely where
 * they stand has it backwards.
 *
 * What it does that nothing else does is sweep. The daily plan
 * concentrates on weak topics on purpose, so a topic secured in week
 * two can go a month without being asked anything, and the product
 * would not notice it slipping. A sitting touches every topic whether
 * the plan scheduled it or not, which is the empirical version of
 * assuming knowledge decays, and better than assuming it: anything it
 * finds has been found rather than modelled. Questions missed in the
 * sweep then join the spaced-retry queue like any others.
 *
 * Four weeks, not three months. A candidate on this product typically
 * has two to four months in total, so a quarterly checkpoint is one
 * most of them would never reach. Four weeks gives a normal revision
 * window two to four sweeps, which is enough to see a line.
 */

export const DIAGNOSTIC_INTERVAL_DAYS = 28;

const DAY_MS = 86_400_000;

export type DiagnosticAvailability =
  /** Never sat. The cold start, and the only time it is the best estimate. */
  | { status: "never" }
  /** Sat before, and the interval has passed. */
  | { status: "due"; lastAt: Date; daysSince: number }
  /** Sat recently. Locked until opensAt. */
  | { status: "waiting"; lastAt: Date; opensAt: Date; daysLeft: number };

export function diagnosticAvailability(
  lastAt: string | null | undefined,
  now: Date
): DiagnosticAvailability {
  if (!lastAt) return { status: "never" };

  const last = new Date(lastAt);
  if (Number.isNaN(last.getTime())) return { status: "never" };

  const opensAt = new Date(last.getTime() + DIAGNOSTIC_INTERVAL_DAYS * DAY_MS);
  const daysSince = Math.floor((now.getTime() - last.getTime()) / DAY_MS);

  if (now.getTime() >= opensAt.getTime()) {
    return { status: "due", lastAt: last, daysSince };
  }
  return {
    status: "waiting",
    lastAt: last,
    opensAt,
    /* Rounded up, so "1 day" never means "in four hours" and never
       means "already". A candidate told zero days would go and look. */
    daysLeft: Math.max(1, Math.ceil((opensAt.getTime() - now.getTime()) / DAY_MS)),
  };
}

/** Whether the page should let them in. */
export function canSitDiagnostic(a: DiagnosticAvailability): boolean {
  return a.status !== "waiting";
}
