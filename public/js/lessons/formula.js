// Lesson 2 — Quadratic equations: the quadratic formula (ax² + bx + c = 0, answers to 2 d.p.).

import { INK, checkTypedAnswer, discriminant, equationText, exactRoots, line, par, round, signed, titleItem } from "./common.js";

const DP = 2;

const METHOD_STEPS = [
  "Read off a, b and c (with their signs)",
  "Write out the formula",
  "Substitute a, b and c",
  "Work out b² − 4ac",
  "Find both answers and round",
];

const fraction = (num, den, extra = {}) => ({ kind: "fraction", size: 28, color: INK.tutor, prefix: "x =", num, den, ...extra });
const formatAnswer = (x) => String(round(x, DP));

export function formulaParts(problem) {
  const { a, b, c } = problem;
  const d = discriminant(problem);
  const root = Math.sqrt(d);
  return {
    d,
    negB: b < 0 ? `-(${b})` : `-${b}`,
    sqB: b < 0 ? `(${b})²` : `${b}²`,
    fourAC: `4 × ${a} × ${par(c)}`,
    rootText: Number.isInteger(root) ? String(root) : root.toFixed(3),
    answers: exactRoots(problem),
  };
}

function solutionSteps(problem) {
  const { a, b, c } = problem;
  const { d, negB, sqB, fourAC, rootText, answers } = formulaParts(problem);
  const [r1, r2] = answers.map(formatAnswer);
  const withoutSqrtB = -b;
  const final = answers.length === 1 ? `x = ${r1}` : `x = ${r1}    or    x = ${r2}`;
  return [
    { text: `a = ${a}      b = ${b}      c = ${c}`, items: [line(`a = ${a}      b = ${b}      c = ${c}`, { size: 28 })] },
    {
      text: "x = (-b ± √(b² - 4ac)) / 2a",
      items: [fraction([{ text: "-b ± " }, { text: "b² - 4ac", root: true }], [{ text: "2a" }])],
    },
    {
      text: `x = (${negB} ± √(${sqB} - ${fourAC})) / (2 × ${a})`,
      items: [fraction([{ text: `${negB} ± ` }, { text: `${sqB} - ${fourAC}`, root: true }], [{ text: `2 × ${a}` }])],
    },
    {
      text: `b² - 4ac = ${sqB} - ${fourAC} = ${b * b} ${signed(-4 * a * c)} = ${d}, so x = (${withoutSqrtB} ± √${d}) / ${2 * a}`,
      items: [
        line(`b² - 4ac = ${b * b} ${signed(-4 * a * c)} = ${d}`, { size: 28 }),
        fraction([{ text: `${withoutSqrtB} ± ` }, { text: String(d), root: true }], [{ text: String(2 * a) }]),
      ],
    },
    {
      text: `x = (${withoutSqrtB} + ${rootText}) ÷ ${2 * a} = ${r1} or x = (${withoutSqrtB} - ${rootText}) ÷ ${2 * a} = ${r2}`,
      items: [
        line(`x = (${withoutSqrtB} + ${rootText}) ÷ ${2 * a} = ${r1}`, { size: 28 }),
        line(`x = (${withoutSqrtB} - ${rootText}) ÷ ${2 * a} = ${r2}`, { size: 28 }),
        line(final, { size: 32, weight: 700, box: true, x: 146 }),
      ],
    },
  ];
}

function hints(problem) {
  const { a, b, c } = problem;
  const { d, negB, sqB, fourAC } = formulaParts(problem);
  return [
    "Read off a, b and c, including their signs. Then write the formula out in full: x = (−b ± √(b² − 4ac)) ÷ 2a.",
    `Here a = ${a}, b = ${b} and c = ${c}. Work out the bit under the square root first: ${sqB} − ${fourAC}. Put negative numbers in brackets so the signs come out right.`,
    `b² − 4ac = ${d}, so x = (${negB} ± √${d}) ÷ ${2 * a}. Now do the + version and the − version, dividing the whole top by ${2 * a}, and round to 2 decimal places.`,
  ];
}

const DEMO_PROBLEM = { id: "demo-formula", lessonId: "formula", demo: true, a: 2, b: 3, c: -4 };
const demoSolution = solutionSteps(DEMO_PROBLEM);

const DEMO_STEPS = [
  {
    title: "Read off a, b and c",
    narration:
      "Check the equation equals zero, then read off a, b and c — including their signs. Here a = 2, b = 3 and c = −4.",
    keyIdea: "The sign belongs to the number: c is −4, not 4.",
  },
  {
    title: "Write the formula",
    narration:
      "Write the formula out in full before you put any numbers in. It's worth learning by heart: x equals minus b, plus or minus the square root of b squared minus 4ac, all over 2a.",
    keyIdea: "The ± gives you two answers: one using +, one using −.",
  },
  {
    title: "Substitute the numbers",
    narration:
      "Now swap each letter for its number. Put negative numbers in brackets so the signs don't trip you up — here that's the −4.",
    keyIdea: "Brackets around negatives: 4 × 2 × (−4).",
  },
  {
    title: "Work out b² − 4ac",
    narration:
      "Work out the part under the square root first. 3² is 9, and 4 × 2 × (−4) is −32. Taking away −32 is the same as adding 32, so it's 9 + 32 = 41.",
    keyIdea: "b² − 4ac is called the discriminant. If it's negative, there are no solutions.",
  },
  {
    title: "Find both answers",
    narration:
      "Use a calculator: √41 is about 6.403. Do the + version and the − version, dividing the whole top line by 4. Rounded to 2 decimal places, x = 0.85 or x = −2.35.",
    keyIdea: "Divide the whole top line by 2a — not just the square root.",
  },
].map((step, i) => ({ ...step, items: demoSolution[i].items }));

const PRACTICE = [
  { id: "f1", a: 1, b: 4, c: 1 },
  { id: "f2", a: 2, b: -5, c: 1 },
  { id: "f3", a: 3, b: 2, c: -2 },
  { id: "f4", a: 1, b: -6, c: 4 },
  { id: "f5", a: 2, b: 7, c: 3 },
].map((p) => ({ ...p, lessonId: "formula" }));

export const formula = {
  id: "formula",
  title: "The quadratic formula",
  methodSteps: METHOD_STEPS,
  demo: {
    problem: DEMO_PROBLEM,
    title: titleItem(`Solve:  ${equationText(DEMO_PROBLEM)}   (2 d.p.)`),
    intro: {
      title: "When factorising won't work",
      narration:
        "Some quadratics don't factorise into nice brackets — like 2x² + 3x − 4 = 0. The quadratic formula solves any quadratic. I'll show you how, one step at a time. Press Start to begin.",
      keyIdea: "The formula works every time, even when a isn't 1 and the answers aren't whole numbers.",
    },
    steps: DEMO_STEPS,
    autoLayout: true,
  },
  practice: PRACTICE,
  practiceIntro:
    "Use the quadratic formula and write each step underneath the last. You can use a calculator for the arithmetic. Give your answers to 2 decimal places, then press Check my work.",
  answerNote: "Give your answers to 2 decimal places.",
  answerDp: DP,
  mistakeTip:
    "Check your signs: −b, and any negative c inside b² − 4ac. Then make sure you divide the whole top line by 2a.",
  recap: ["Reading off a, b and c with their signs", "Substituting into the formula", "Working out b² − 4ac", "Rounding to 2 decimal places"],
  practiceTitle: (problem) => titleItem(`Your turn:  ${equationText(problem)}   (2 d.p.)`),
  solutionSteps,
  hints,
  answers: (problem) => exactRoots(problem).map((x) => round(x, DP)),
  // Accept anything that rounds to the right 2 d.p. answer (or is more precise).
  checkAnswer: (problem, values) => checkTypedAnswer(exactRoots(problem), values, 0.0051),
  referenceText(problem) {
    const { a, b } = problem;
    const { d, answers } = formulaParts(problem);
    return `Discriminant b² - 4ac = ${d}; exact solutions x = (${-b} ± √${d}) / ${2 * a}; to 2 d.p. x = ${answers.map(formatAnswer).join(" and x = ")}.`;
  },
  gradingNotes:
    "Students may use a calculator, so they might skip writing some arithmetic — that's fine. Accept answers to 2 decimal places (a last-digit rounding slip is minor if the method is right), more decimal places, or exact form such as (-3 ± √41)/4. Watch especially for sign errors with -b and with a negative c inside b² - 4ac, and for dividing only part of the top line by 2a. Never reveal the value of b² - 4ac or the final answers unless the student has already written them, or this is a level-3 hint.",
};
