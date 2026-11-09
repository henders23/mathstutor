// Lesson 1 — Quadratic equations: solving by factorising (x² + bx + c = 0).

import { INK, LEFT, checkTypedAnswer, equationText, exactRoots, line, signed, titleItem } from "./common.js";

export function bracket(p) {
  return p === 0 ? "x" : `(x ${signed(p)})`;
}

// For x² + bx + c with integer roots, find p and q with p × q = c and p + q = b,
// so x² + bx + c = (x + p)(x + q). Returns null when it doesn't factorise over the integers.
export function factorPair(b, c) {
  const limit = Math.max(Math.abs(c), 1);
  for (let p = -limit; p <= limit; p++) {
    if (p === 0) {
      if (c === 0) return { p: 0, q: b };
      continue;
    }
    if (c % p !== 0) continue;
    const q = c / p;
    if (p + q === b && p <= q) return { p, q };
  }
  return null;
}

const METHOD_STEPS = [
  "Read off a, b and c",
  "Find two numbers that multiply to c and add to b",
  "Write two brackets",
  "Set each bracket to zero",
  "Solve and check",
];

function solutionSteps(problem) {
  const { b, c } = problem;
  const { p, q } = factorPair(b, c);
  const [r1, r2] = [-p, -q];
  const texts = [
    `a = 1      b = ${b}      c = ${c}`,
    `${p} × ${q} = ${c}      ${p} + ${q} = ${b}`,
    `${bracket(p)}${bracket(q)} = 0`,
    `x ${signed(p)} = 0    or    x ${signed(q)} = 0`,
    r1 === r2 ? `x = ${r1}` : `x = ${r1}    or    x = ${r2}`,
  ];
  return texts.map((text) => ({ text, items: [line(text, { size: 32 })] }));
}

function hints(problem) {
  const { b, c } = problem;
  const { p, q } = factorPair(b, c);
  return [
    `Start by reading off a, b and c. Then look for two numbers that multiply to ${c} and add to ${b}.`,
    c < 0
      ? `Because c is negative, one of your numbers must be negative and one positive. Try the factor pairs of ${Math.abs(c)} and check which pair adds to ${b}.`
      : `Because c is positive, both numbers have the same sign${b < 0 ? " — and since b is negative, both are negative" : ""}. List the factor pairs of ${c} and check their sums.`,
    `The numbers are ${p} and ${q}: ${p} × ${q} = ${c} and ${p} + ${q} = ${b}. So the brackets are ${bracket(p)}${bracket(q)} = 0. Can you finish it?`,
  ];
}

const DEMO_PROBLEM = { id: "demo-factorising", lessonId: "factorising", demo: true, a: 1, b: 5, c: 6 };

const DEMO_STEPS = [
  {
    title: "Read off a, b and c",
    narration:
      "Every quadratic can be written as ax² + bx + c = 0. Start by reading off the three numbers. Here a = 1, b = 5 and c = 6.",
    keyIdea: "Get the equation equal to zero first, then name a, b and c.",
    items: [
      { kind: "badge", x: 108, y: 140, label: "1" },
      { kind: "line", x: LEFT, y: 152, size: 32, color: INK.tutor, segments: [{ text: "a = 1      b = 5      c = 6" }] },
    ],
  },
  {
    title: "Find the magic pair",
    narration:
      "When a = 1, look for two numbers that multiply to c and add to b. List the factor pairs of 6 and check each sum.",
    keyIdea: "Multiply to c, add to b.",
    items: [
      { kind: "badge", x: 108, y: 212, label: "2" },
      { kind: "line", x: LEFT, y: 222, size: 26, color: INK.tutor, segments: [{ text: "multiply to 6, add to 5:" }] },
      { kind: "line", x: LEFT, y: 266, size: 30, color: INK.tutor, segments: [{ text: "1 × 6   →   1 + 6 = 7" }] },
      {
        kind: "line",
        x: LEFT,
        y: 310,
        size: 30,
        color: INK.tutor,
        segments: [{ text: "2 × 3", ring: INK.fix }, { text: "   →   2 + 3 = 5   " }, { text: "✓", color: INK.good, weight: 700 }],
      },
    ],
  },
  {
    title: "Write two brackets",
    narration:
      "2 and 3 work, so the quadratic factorises into two brackets: (x + 2)(x + 3). Expand it in your head to check you get x² + 5x + 6 back.",
    keyIdea: "The pair you found goes straight into the brackets.",
    items: [
      { kind: "badge", x: 108, y: 372, label: "3" },
      { kind: "line", x: LEFT, y: 386, size: 38, weight: 700, color: INK.tutor, segments: [{ text: "(x + 2)(x + 3) = 0" }] },
    ],
  },
  {
    title: "Set each bracket to zero",
    narration:
      "If two things multiply to make zero, at least one of them must be zero. So either x + 2 = 0 or x + 3 = 0.",
    keyIdea: "Zero-product rule: if A × B = 0, then A = 0 or B = 0.",
    items: [
      { kind: "badge", x: 108, y: 446, label: "4" },
      { kind: "line", x: LEFT, y: 458, size: 32, color: INK.tutor, segments: [{ text: "x + 2 = 0     or     x + 3 = 0" }] },
    ],
  },
  {
    title: "Solve and check",
    narration:
      "Solve each little equation: x = −2 or x = −3. Always substitute back in to check — both make the left-hand side equal 0.",
    keyIdea: "Quadratics usually have two answers. Check both.",
    items: [
      { kind: "badge", x: 108, y: 520, label: "5" },
      { kind: "line", x: LEFT + 6, y: 536, size: 36, weight: 700, color: INK.tutor, box: true, segments: [{ text: "x = -2     or     x = -3" }] },
      {
        kind: "line",
        x: LEFT,
        y: 600,
        size: 24,
        color: INK.tutor,
        segments: [{ text: "check:  (-2)² + 5(-2) + 6 = 4 - 10 + 6 = 0  " }, { text: "✓", color: INK.good, weight: 700 }],
      },
    ],
  },
];

const PRACTICE = [
  { id: "p1", b: -1, c: -12 },
  { id: "p2", b: 7, c: 10 },
  { id: "p3", b: -8, c: 15 },
  { id: "p4", b: 2, c: -15 },
  { id: "p5", b: 0, c: -9 },
].map((p) => ({ ...p, a: 1, lessonId: "factorising" }));

export const factorising = {
  id: "factorising",
  title: "Solving by factorising",
  methodSteps: METHOD_STEPS,
  demo: {
    problem: DEMO_PROBLEM,
    title: titleItem(`Solve:  ${equationText(DEMO_PROBLEM)}`),
    intro: {
      title: "Let's solve a quadratic",
      narration:
        "I'll work through x² + 5x + 6 = 0 on the board, one step at a time. Watch how each line follows from the one before. Press Start to begin.",
      keyIdea: "Solving means finding the values of x that make the equation true.",
    },
    steps: DEMO_STEPS,
  },
  practice: PRACTICE,
  practiceIntro:
    "Use the same five steps as the demo and write each one underneath the last. Press Check my work whenever you like — I'll read your handwriting and tell you how it's going.",
  answerNote: "",
  answerDp: null,
  mistakeTip: "Check your pair against both rules: multiply to c and add to b. Then fix the line and check again.",
  recap: ["Factor pairs: multiply to c, add to b", "Zero-product rule", "Checking by substitution"],
  practiceTitle: (problem) => titleItem(`Your turn:  ${equationText(problem)}`),
  solutionSteps,
  hints,
  answers: (problem) => exactRoots(problem),
  checkAnswer: (problem, values) => checkTypedAnswer(exactRoots(problem), values),
  referenceText(problem) {
    const { p, q } = factorPair(problem.b, problem.c);
    return `Factor pair ${p} and ${q}; solutions x = ${exactRoots(problem).join(" and x = ")}.`;
  },
  gradingNotes: "Never reveal the factor pair or the final answers unless the student has already written them, or this is a level-3 hint.",
};
