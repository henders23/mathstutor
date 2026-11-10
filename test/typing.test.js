import test from "node:test";
import assert from "node:assert/strict";
import { convertLatexToAsciiMath } from "mathlive";
import { answersFromText, isSafeLatex } from "../public/js/mathtext.js";
import { segmentRows, typedRowText } from "../public/js/rows.js";

test("LaTeX safety: maths commands are fine, anything that could inject markup is refused", () => {
  for (const ok of ["x^2-x-12=0", "x=\\frac{-4\\pm\\sqrt{12}}{2}", "x=4\\text{ or }x=-3", "(x-4)(x+3)=0", "x\\approx 0.85", "a\\times b\\div c", "x = 1, \\: x=2"])
    assert.equal(isSafeLatex(ok), true, ok);
  for (const bad of ["\\href{javascript:alert(1)}{x}", "\\htmlData{a=b}{x}", "\\class{evil}{x}", "\\style{color:red}{x}", "\\includegraphics{x}", "x".repeat(1001), 42])
    assert.equal(isSafeLatex(bad), false, String(bad).slice(0, 30));
});

test("typed answers are read from MathLive's plain-text output", () => {
  const read = (latex) => answersFromText(convertLatexToAsciiMath(latex));
  assert.deepEqual(read("x=4\\text{ or }x=-3"), [4, -3]);
  assert.deepEqual(read("x=-0.27\\;\\mathrm{or}\\;x=-3.73"), [-0.27, -3.73]);
  assert.deepEqual(read("x=-0.27,\\: x=-3.73"), [-0.27, -3.73]);
  assert.deepEqual(read("x=\\frac{-1}{2}\\text{ or }x=-3"), [-0.5, -3]);
  assert.deepEqual(read("x = 0.85"), [0.85]);
  // Working, not answers:
  assert.deepEqual(read("x=\\frac{-4\\pm\\sqrt{12}}{2}"), []);
  assert.deepEqual(read("(x-4)(x+3)=0"), []);
  assert.deepEqual(read("2x=4"), []);
  assert.deepEqual(read("x=4x"), []);
  assert.deepEqual(answersFromText("x = −3"), [-3]);
});

test("typed lines and handwriting share rows", () => {
  const ink = (id, top) => ({ id, tool: "pen", width: 3, points: [{ x: 100, y: top }, { x: 110, y: top + 36 }] });
  const rows = segmentRows(
    [ink(1, 100), ink(2, 240)],
    [
      { id: 10, left: 300, top: 98, right: 500, bottom: 140 }, // typed next to the first handwritten line
      { id: 11, left: 100, top: 170, right: 400, bottom: 210 }, // a typed line of its own
    ],
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.strokeIds, r.typedIds]), [[[1], [10]], [[], [11]], [[2], []]]);
  const typed = [
    { id: 10, latex: "=0", x: 300 },
    { id: 11, latex: "x=4", x: 100 },
  ];
  assert.deepEqual(typedRowText(rows, typed), [
    { row: 1, latex: "=0" },
    { row: 2, latex: "x=4" },
  ]);
});

test("several typed boxes on one row are joined left to right", () => {
  const rows = segmentRows([], [
    { id: 2, left: 300, top: 100, right: 400, bottom: 140 },
    { id: 1, left: 100, top: 102, right: 200, bottom: 142 },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(typedRowText(rows, [{ id: 1, latex: "x=4", x: 100 }, { id: 2, latex: "x=-3", x: 300 }]), [{ row: 1, latex: "x=4 \\quad x=-3" }]);
});
