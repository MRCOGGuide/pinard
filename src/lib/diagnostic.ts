import type { Section } from "@/lib/types";

/**
 * The free diagnostic: what it asks, and what it is allowed to claim.
 *
 * Fifteen questions against a syllabus of thirty-five sub-topics is a
 * sighting shot rather than a survey, and everything here exists to
 * keep the page honest about that. The spread puts the fifteen in
 * fifteen DIFFERENT sub-topics, across the three modules in turn, so
 * what comes back says something about the breadth of the syllabus
 * rather than about one corner of it. The summary then reports a score
 * per module, where five questions make a figure worth printing, and
 * names the individual sub-topics missed WITHOUT calling them weak —
 * one question cannot establish that, and a product that tells a
 * candidate they are weak at preterm birth on a single wrong answer is
 * lying to them in the direction of its own interest.
 *
 * Pure: no database, so the rules above can be tested.
 */

/** A section that can supply questions, with its module. */
export type Candidate = {
  sectionId: number;
  title: string;
  /** The top-level module: Obstetrics, Gynaecology, Governance. */
  moduleId: number;
  moduleTitle: string;
  available: number;
};

/**
 * Which sub-topics the fifteen come from.
 *
 * One per sub-topic, taken from each module in turn, so a short
 * diagnostic cannot spend six of its fifteen questions in Gynaecology
 * while Obstetrics gets two. Modules take their turn in the order
 * given, which is the syllabus's own order, and a module that runs out
 * of sub-topics simply stops taking turns.
 */
export function spreadAcrossSyllabus(
  candidates: Candidate[],
  size: number
): Candidate[] {
  const byModule = new Map<number, Candidate[]>();
  for (const c of candidates) {
    if (c.available <= 0) continue;
    const list = byModule.get(c.moduleId);
    if (list) list.push(c);
    else byModule.set(c.moduleId, [c]);
  }
  /* Richest sub-topic first within a module: a thin one is more likely
     to be thin because the bank is young there, not because the
     syllabus is. */
  Array.from(byModule.values()).forEach((list) => {
    list.sort(
      (a: Candidate, b: Candidate) =>
        b.available - a.available || a.sectionId - b.sectionId
    );
  });

  const picked: Candidate[] = [];
  const queues = Array.from(byModule.values());
  let exhausted = false;
  while (picked.length < size && !exhausted) {
    exhausted = true;
    for (const queue of queues) {
      if (picked.length >= size) break;
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      exhausted = false;
    }
  }
  return picked;
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
  /** Sub-topics the fifteen never reached. */
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
