// The lesson catalogue, in teaching order.

import { factorising } from "./factorising.js";
import { formula } from "./formula.js";

export { INK, TOPIC_TITLE } from "./common.js";

export const LESSONS = [factorising, formula];

export function findLesson(id) {
  return LESSONS.find((lesson) => lesson.id === id) ?? null;
}

// Finds a practice question (or demo problem) by id across all lessons.
export function findProblem(id) {
  for (const lesson of LESSONS) {
    if (lesson.demo.problem.id === id) return lesson.demo.problem;
    const problem = lesson.practice.find((p) => p.id === id);
    if (problem) return problem;
  }
  return null;
}
