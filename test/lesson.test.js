import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_PROBLEM,
  DEMO_STEPS,
  PRACTICE,
  bracket,
  checkTypedAnswer,
  equationText,
  factorPair,
  roots,
  scriptedHints,
  solutionLines,
} from "../public/js/lesson.js";

test("equations are written the way a teacher would", () => {
  assert.equal(equationText({ b: 5, c: 6 }), "x² + 5x + 6 = 0");
  assert.equal(equationText({ b: -1, c: -12 }), "x² - x - 12 = 0");
  assert.equal(equationText({ b: 0, c: -9 }), "x² - 9 = 0");
  assert.equal(bracket(-4), "(x - 4)");
  assert.equal(bracket(3), "(x + 3)");
});

test("every problem factorises and its roots satisfy the equation", () => {
  for (const problem of [DEMO_PROBLEM, ...PRACTICE]) {
    const pair = factorPair(problem.b, problem.c);
    assert.ok(pair, `${problem.id} should factorise`);
    assert.equal(pair.p * pair.q, problem.c);
    assert.equal(pair.p + pair.q, problem.b);
    for (const x of roots(problem)) assert.equal(x * x + problem.b * x + problem.c, 0);
  }
});

test("worked solution lines for x² - x - 12 = 0", () => {
  assert.deepEqual(solutionLines({ b: -1, c: -12 }), [
    "a = 1      b = -1      c = -12",
    "-4 × 3 = -12      -4 + 3 = -1",
    "(x - 4)(x + 3) = 0",
    "x - 4 = 0    or    x + 3 = 0",
    "x = 4    or    x = -3",
  ]);
});

test("the demo has five steps with narration", () => {
  assert.equal(DEMO_STEPS.length, 5);
  for (const step of DEMO_STEPS) {
    assert.ok(step.title && step.narration && step.keyIdea);
    assert.ok(step.items.length > 0);
  }
});

test("scripted hints escalate and only the last reveals the pair", () => {
  const hints = scriptedHints({ b: -1, c: -12 });
  assert.equal(hints.length, 3);
  assert.ok(!hints[0].includes("-4") && !hints[1].includes("-4"));
  assert.match(hints[2], /-4 and 3/);
});

test("typed answers: any order, x= prefix and unicode minus accepted", () => {
  const problem = { b: -1, c: -12 };
  assert.equal(checkTypedAnswer(problem, ["-3", "4"]).correct, true);
  assert.equal(checkTypedAnswer(problem, ["x = 4", "−3"]).correct, true);
  assert.deepEqual(checkTypedAnswer(problem, ["4", ""]), { correct: false, reason: "missing" });
  assert.deepEqual(checkTypedAnswer(problem, ["3", "-4"]), { correct: false, reason: "wrong" });
  assert.deepEqual(checkTypedAnswer(problem, ["four", "-3"]), { correct: false, reason: "not-a-number" });
});
