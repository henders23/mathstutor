// Helpers for typed maths (LaTeX from the MathLive input boxes). Pure functions, shared with tests.

export const MAX_LATEX = 1000;

// LaTeX commands a student can reasonably produce while solving equations. Anything else
// (\href, \class, \htmlData, \style, \includegraphics, …) is refused, and the line is shown as plain text.
const ALLOWED = new Set(
  (
    "frac dfrac tfrac sqrt pm mp times div cdot ast left right text textrm textbf textit mathrm mathit mathbf " +
    "operatorname le leq ge geq ne neq lt gt approx equiv quad qquad placeholder ldots cdots dots infty degree " +
    "rightarrow Rightarrow implies therefore because lbrack rbrack lbrace rbrace vert lvert rvert mid prime " +
    "alpha beta gamma delta epsilon varepsilon theta lambda mu pi rho sigma tau phi varphi omega Delta Pi Sigma Omega " +
    "exponentialE imaginaryI differentialD bigl bigr Bigl Bigr"
  ).split(" "),
);
const ALLOWED_SYMBOLS = new Set([",", ";", ":", "!", " ", "{", "}", "%", "_", "#", "&", "$", "\\"]);

export function isSafeLatex(latex) {
  if (typeof latex !== "string" || latex.length > MAX_LATEX) return false;
  for (const match of latex.matchAll(/\\([a-zA-Z]+|.)/g)) {
    const name = match[1];
    if (/^[a-zA-Z]+$/.test(name) ? !ALLOWED.has(name) : !ALLOWED_SYMBOLS.has(name)) return false;
  }
  return true;
}

// Pulls numeric answers like "x = 4 or x = -3", "x = 0.85, x = -2.35" or "x = (-1)/(2)"
// out of a line of ASCII maths. Returns [] when the line doesn't state answers.
export function answersFromText(text) {
  const s = String(text ?? "")
    .replace(/[−–]/g, "-")
    .replace(/"[^"]*"/g, " ; ") // quoted text, e.g. from \text{or}
    .replace(/(^|[^a-z])o\s?r(?![a-z])/gi, "$1;") // "or" (MathLive writes \mathrm{or} as "o r")
    .replace(/\s+/g, "")
    .replace(/\((-?\d+(?:\.\d+)?)\)/g, "$1");
  const answers = [];
  for (const m of s.matchAll(/(?:^|[^a-z0-9])x=(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?(?=$|[,;]|or)/gi)) {
    const value = m[2] === undefined ? Number(m[1]) : Number(m[1]) / Number(m[2]);
    if (Number.isFinite(value)) answers.push(value);
  }
  return answers;
}
