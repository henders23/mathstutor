// Lesson content for "Quadratic equations: solving by factorising".
// Pure data + helpers so it can be shared by the browser app, the server
// (which tells Claude the correct answer) and the tests.

export const LESSON_ID = "quadratics-factorising";
export const LESSON_TITLE = "Solving by factorising";
export const TOPIC_TITLE = "Quadratic equations";

export const INK = {
  tutor: "#1F5FD1",
  student: "#23262E",
  fix: "#D9480F",
  good: "#237032",
};

export const METHOD_STEPS = [
  "Read off a, b and c",
  "Find two numbers that multiply to c and add to b",
  "Write two brackets",
  "Set each bracket to zero",
  "Solve and check",
];

// ---- formatting helpers (board text uses ASCII "-" so handwriting fonts render it) ----

export function signed(n) {
  return n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`;
}

function linearTerm(b) {
  if (b === 0) return "";
  const size = Math.abs(b) === 1 ? "" : String(Math.abs(b));
  return ` ${b < 0 ? "-" : "+"} ${size}x`;
}

export function equationText({ b, c }) {
  return `x²${linearTerm(b)} ${signed(c)} = 0`;
}

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

export function roots(problem) {
  const pair = factorPair(problem.b, problem.c);
  if (!pair) return null;
  return [-pair.p, -pair.q].sort((m, n) => n - m);
}

function times(p, q) {
  return `${p} × ${q}`;
}

// The five written steps of the worked solution (board-ready text).
export function solutionLines(problem) {
  const { b, c } = problem;
  const { p, q } = factorPair(b, c);
  const [r1, r2] = [-p, -q];
  return [
    `a = 1      b = ${b}      c = ${c}`,
    `${times(p, q)} = ${c}      ${p} + ${q} = ${b}`,
    `${bracket(p)}${bracket(q)} = 0`,
    `x ${signed(p)} = 0    or    x ${signed(q)} = 0`,
    r1 === r2 ? `x = ${r1}` : `x = ${r1}    or    x = ${r2}`,
  ];
}

export function scriptedHints(problem) {
  const { b, c } = problem;
  const { p, q } = factorPair(b, c);
  return [
    `Start by reading off a, b and c. Then look for two numbers that multiply to ${c} and add to ${b}.`,
    c < 0
      ? `Because c is negative, one of your numbers must be negative and one positive. Try the factor pairs of ${Math.abs(c)} and check which pair adds to ${b}.`
      : `Because c is positive, both numbers have the same sign${b < 0 ? " — and since b is negative, both are negative" : ""}. List the factor pairs of ${c} and check their sums.`,
    `The numbers are ${p} and ${q}: ${times(p, q)} = ${c} and ${p} + ${q} = ${b}. So the brackets are ${bracket(p)}${bracket(q)} = 0. Can you finish it?`,
  ];
}

// Typed-answer check, used when AI handwriting checking isn't configured.
export function checkTypedAnswer(problem, values) {
  const expected = roots(problem);
  const given = values
    .map((v) => String(v ?? "").replace(/\s+/g, "").replace(/^x=/i, "").replace("−", "-"))
    .filter((v) => v !== "")
    .map(Number);
  if (given.some((v) => !Number.isFinite(v))) return { correct: false, reason: "not-a-number" };
  const unique = [...new Set(expected)];
  const givenUnique = [...new Set(given)];
  if (givenUnique.length < unique.length) return { correct: false, reason: "missing" };
  const allRight = givenUnique.length === unique.length && unique.every((r) => givenUnique.includes(r));
  return { correct: allRight, reason: allRight ? "ok" : "wrong" };
}

// ---- Demo: the tutor works through x² + 5x + 6 = 0 ----

export const DEMO_PROBLEM = { id: "demo", b: 5, c: 6 };

const L = 140; // left edge of written working on the board

export const DEMO_TITLE = {
  kind: "line",
  x: L,
  y: 60,
  size: 42,
  weight: 700,
  color: INK.tutor,
  underline: true,
  segments: [{ text: `Solve:  ${equationText(DEMO_PROBLEM)}` }],
};

export const DEMO_STEPS = [
  {
    title: "Read off a, b and c",
    narration:
      "Every quadratic can be written as ax² + bx + c = 0. Start by reading off the three numbers. Here a = 1, b = 5 and c = 6.",
    keyIdea: "Get the equation equal to zero first, then name a, b and c.",
    items: [
      { kind: "badge", x: 108, y: 140, label: "1" },
      { kind: "line", x: L, y: 152, size: 32, color: INK.tutor, segments: [{ text: "a = 1      b = 5      c = 6" }] },
    ],
  },
  {
    title: "Find the magic pair",
    narration:
      "When a = 1, look for two numbers that multiply to c and add to b. List the factor pairs of 6 and check each sum.",
    keyIdea: "Multiply to c, add to b.",
    items: [
      { kind: "badge", x: 108, y: 212, label: "2" },
      { kind: "line", x: L, y: 222, size: 26, color: INK.tutor, segments: [{ text: "multiply to 6, add to 5:" }] },
      { kind: "line", x: L, y: 266, size: 30, color: INK.tutor, segments: [{ text: "1 × 6   →   1 + 6 = 7" }] },
      {
        kind: "line",
        x: L,
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
      { kind: "line", x: L, y: 386, size: 38, weight: 700, color: INK.tutor, segments: [{ text: "(x + 2)(x + 3) = 0" }] },
    ],
  },
  {
    title: "Set each bracket to zero",
    narration:
      "If two things multiply to make zero, at least one of them must be zero. So either x + 2 = 0 or x + 3 = 0.",
    keyIdea: "Zero-product rule: if A × B = 0, then A = 0 or B = 0.",
    items: [
      { kind: "badge", x: 108, y: 446, label: "4" },
      { kind: "line", x: L, y: 458, size: 32, color: INK.tutor, segments: [{ text: "x + 2 = 0     or     x + 3 = 0" }] },
    ],
  },
  {
    title: "Solve and check",
    narration:
      "Solve each little equation: x = −2 or x = −3. Always substitute back in to check — both make the left-hand side equal 0.",
    keyIdea: "Quadratics usually have two answers. Check both.",
    items: [
      { kind: "badge", x: 108, y: 520, label: "5" },
      { kind: "line", x: L + 6, y: 536, size: 36, weight: 700, color: INK.tutor, box: true, segments: [{ text: "x = -2     or     x = -3" }] },
      {
        kind: "line",
        x: L,
        y: 600,
        size: 24,
        color: INK.tutor,
        segments: [{ text: "check:  (-2)² + 5(-2) + 6 = 4 - 10 + 6 = 0  " }, { text: "✓", color: INK.good, weight: 700 }],
      },
    ],
  },
];

// ---- Practice problems (all monic, integer roots; gradually trickier signs) ----

export const PRACTICE = [
  { id: "p1", b: -1, c: -12 },
  { id: "p2", b: 7, c: 10 },
  { id: "p3", b: -8, c: 15 },
  { id: "p4", b: 2, c: -15 },
  { id: "p5", b: 0, c: -9 },
];

export function practiceTitle(problem) {
  return {
    kind: "line",
    x: L,
    y: 60,
    size: 42,
    weight: 700,
    color: INK.tutor,
    underline: true,
    segments: [{ text: `Your turn:  ${equationText(problem)}` }],
  };
}

export function findProblem(id) {
  if (id === DEMO_PROBLEM.id) return DEMO_PROBLEM;
  return PRACTICE.find((problem) => problem.id === id) ?? null;
}
