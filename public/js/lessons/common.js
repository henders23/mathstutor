// Shared maths and formatting helpers for quadratic-equation lessons.
// Board text uses ASCII "-" so handwriting fonts render it; the UI swaps in "−".

export const TOPIC_TITLE = "Quadratic equations";

export const INK = {
  tutor: "#1F5FD1",
  student: "#23262E",
  fix: "#D9480F",
  good: "#237032",
};

export const LEFT = 140; // left edge of written working on the board

export function signed(n) {
  return n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`;
}

// "(-4)" for negatives, "4" otherwise — for substituting into expressions.
export function par(n) {
  return n < 0 ? `(${n})` : String(n);
}

function leadingTerm(a) {
  if (a === 1) return "x²";
  if (a === -1) return "-x²";
  return `${a}x²`;
}

function linearTerm(b) {
  if (b === 0) return "";
  const size = Math.abs(b) === 1 ? "" : String(Math.abs(b));
  return ` ${b < 0 ? "-" : "+"} ${size}x`;
}

export function equationText({ a = 1, b, c }) {
  return `${leadingTerm(a)}${linearTerm(b)}${c === 0 ? "" : ` ${signed(c)}`} = 0`;
}

export function discriminant({ a = 1, b, c }) {
  return b * b - 4 * a * c;
}

const clean = (x) => {
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};

// Real solutions, largest first (one entry for a repeated root, none if no real roots).
export function exactRoots(problem) {
  const { a = 1, b } = problem;
  const d = discriminant(problem);
  if (d < 0) return [];
  const s = Math.sqrt(d);
  const values = [clean((-b + s) / (2 * a)), clean((-b - s) / (2 * a))].sort((m, n) => n - m);
  return values[0] === values[1] ? [values[0]] : values;
}

export function round(x, dp) {
  const f = 10 ** dp;
  const r = Math.round(x * f + (x >= 0 ? 1e-9 : -1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}

// Typed-answer check, used when AI handwriting checking isn't configured.
export function checkTypedAnswer(expected, values, tolerance = 1e-9) {
  const given = values
    .map((v) => String(v ?? "").replace(/\s+/g, "").replace(/^x=/i, "").replace(/−/g, "-"))
    .filter((v) => v !== "")
    .map(Number);
  if (given.some((v) => !Number.isFinite(v))) return { correct: false, reason: "not-a-number" };
  const unique = [];
  for (const v of given) if (!unique.some((u) => Math.abs(u - v) <= tolerance)) unique.push(v);
  if (unique.length < expected.length) return { correct: false, reason: "missing" };
  const matches = (r) => unique.some((v) => Math.abs(v - r) <= tolerance);
  const allRight = unique.length === expected.length && expected.every(matches);
  return { correct: allRight, reason: allRight ? "ok" : "wrong" };
}

// Board item helpers. Items without x/y are placed by the app beneath the existing working.
export const line = (text, extra = {}) => ({ kind: "line", size: 30, color: INK.tutor, segments: [{ text }], ...extra });

export function titleItem(text) {
  return { kind: "line", x: LEFT, y: 60, size: 40, weight: 700, color: INK.tutor, underline: true, segments: [{ text }] };
}
