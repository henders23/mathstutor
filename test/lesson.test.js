import test from "node:test";
import assert from "node:assert/strict";
import { checkTypedAnswer, discriminant, equationText, exactRoots, round } from "../public/js/lessons/common.js";
import { bracket, factorPair, factorising } from "../public/js/lessons/factorising.js";
import { formula } from "../public/js/lessons/formula.js";
import { LESSONS, findProblem } from "../public/js/lessons/index.js";

test("equations are written the way a teacher would", () => {
  assert.equal(equationText({ a: 1, b: 5, c: 6 }), "x² + 5x + 6 = 0");
  assert.equal(equationText({ a: 1, b: -1, c: -12 }), "x² - x - 12 = 0");
  assert.equal(equationText({ a: 1, b: 0, c: -9 }), "x² - 9 = 0");
  assert.equal(equationText({ a: 2, b: 3, c: -4 }), "2x² + 3x - 4 = 0");
  assert.equal(equationText({ a: 3, b: -1, c: 0 }), "3x² - x = 0");
  assert.equal(bracket(-4), "(x - 4)");
  assert.equal(bracket(3), "(x + 3)");
});

test("roots and rounding", () => {
  assert.deepEqual(exactRoots({ a: 1, b: -1, c: -12 }), [4, -3]);
  assert.deepEqual(exactRoots({ a: 1, b: 2, c: 1 }), [-1]);
  assert.deepEqual(exactRoots({ a: 1, b: 0, c: 1 }), []);
  assert.equal(round(-2.3508, 2), -2.35);
  assert.equal(round(0.125, 2), 0.13);
  assert.equal(round(-0.001, 2), 0);
});

test("every lesson is complete and every answer satisfies its equation", () => {
  const ids = new Set();
  for (const lesson of LESSONS) {
    assert.equal(lesson.methodSteps.length, 5, lesson.id);
    assert.equal(lesson.demo.steps.length, 5, lesson.id);
    for (const step of lesson.demo.steps) assert.ok(step.title && step.narration && step.keyIdea && step.items.length);
    assert.equal(lesson.recap.length >= 3, true);
    for (const problem of [lesson.demo.problem, ...lesson.practice]) {
      assert.ok(!ids.has(problem.id), `duplicate id ${problem.id}`);
      ids.add(problem.id);
      assert.equal(problem.lessonId, lesson.id);
      assert.equal(findProblem(problem.id), problem);
      assert.equal(lesson.solutionSteps(problem).length, 5);
      assert.equal(lesson.hints(problem).length, 3);
      for (const x of exactRoots(problem)) assert.ok(Math.abs(problem.a * x * x + problem.b * x + problem.c) < 1e-6);
      assert.equal(lesson.checkAnswer(problem, lesson.answers(problem).map(String)).correct, true, problem.id);
    }
  }
});

test("factorising: practice questions factorise, worked lines for x² - x - 12 = 0", () => {
  for (const p of factorising.practice) assert.ok(factorPair(p.b, p.c));
  assert.deepEqual(
    factorising.solutionSteps({ a: 1, b: -1, c: -12 }).map((s) => s.text),
    ["a = 1      b = -1      c = -12", "-4 × 3 = -12      -4 + 3 = -1", "(x - 4)(x + 3) = 0", "x - 4 = 0    or    x + 3 = 0", "x = 4    or    x = -3"],
  );
  const hints = factorising.hints({ a: 1, b: -1, c: -12 });
  assert.ok(!hints[0].includes("-4") && !hints[1].includes("-4"));
  assert.match(hints[2], /-4 and 3/);
});

test("formula: the demo's worked solution for 2x² + 3x - 4 = 0", () => {
  const demo = formula.demo.problem;
  assert.equal(discriminant(demo), 41);
  assert.deepEqual(formula.answers(demo), [0.85, -2.35]);
  const texts = formula.solutionSteps(demo).map((s) => s.text);
  assert.equal(texts[0], "a = 2      b = 3      c = -4");
  assert.equal(texts[2], "x = (-3 ± √(3² - 4 × 2 × (-4))) / (2 × 2)");
  assert.match(texts[3], /= 9 \+ 32 = 41/);
  assert.match(texts[4], /6\.403\) ÷ 4 = 0\.85/);
  // Negative b is substituted in brackets so the sign error is visible.
  assert.match(formula.solutionSteps({ a: 2, b: -5, c: 1 })[2].text, /x = \(-\(-5\) ± √\(\(-5\)² - 4 × 2 × 1\)\)/);
});

test("formula: practice questions have two real answers and hints hold back the discriminant", () => {
  for (const p of formula.practice) {
    assert.ok(discriminant(p) > 0, p.id);
    const d = String(discriminant(p));
    const [h1, h2, h3] = formula.hints(p);
    assert.ok(!h1.includes(`√${d}`) && !h2.includes(`= ${d}`), p.id);
    assert.match(h3, new RegExp(`b² − 4ac = ${d}`));
  }
});

test("typed answers: order, x= prefix, unicode minus and 2 d.p. tolerance", () => {
  const p1 = factorising.practice[0];
  assert.equal(factorising.checkAnswer(p1, ["-3", "4"]).correct, true);
  assert.equal(factorising.checkAnswer(p1, ["x = 4", "−3"]).correct, true);
  assert.deepEqual(factorising.checkAnswer(p1, ["4", ""]), { correct: false, reason: "missing" });
  assert.deepEqual(factorising.checkAnswer(p1, ["3", "-4"]), { correct: false, reason: "wrong" });
  assert.deepEqual(factorising.checkAnswer(p1, ["four", "-3"]), { correct: false, reason: "not-a-number" });
  assert.equal(factorising.checkAnswer(p1, ["4.01", "-3"]).correct, false);

  const demo = formula.demo.problem; // 0.8508…, -2.3508…
  assert.equal(formula.checkAnswer(demo, ["0.85", "-2.35"]).correct, true);
  assert.equal(formula.checkAnswer(demo, ["0.851", "-2.351"]).correct, true);
  assert.equal(formula.checkAnswer(demo, ["0.86", "-2.35"]).correct, false);
  assert.equal(formula.checkAnswer(demo, ["0.85", "2.35"]).correct, false);
  assert.equal(checkTypedAnswer([1, 2], ["1", "1"]).reason, "missing");
});
