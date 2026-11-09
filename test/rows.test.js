import test from "node:test";
import assert from "node:assert/strict";
import { segmentRows } from "../public/js/rows.js";

let id = 0;
// A rough "glyph": a vertical-ish stroke spanning [top, bottom] at x.
const glyph = (x, top, bottom) => ({ id: ++id, tool: "pen", width: 3, points: [{ x, y: top }, { x: x + 8, y: (top + bottom) / 2 }, { x, y: bottom }] });
const bar = (x, y, w = 14) => ({ id: ++id, tool: "pen", width: 3, points: [{ x, y }, { x: x + w, y }] });
const dot = (x, y) => ({ id: ++id, tool: "pen", width: 3, points: [{ x, y }] });

function lineOfWriting(top, { withEquals = true, withSquare = false } = {}) {
  const strokes = [];
  for (let i = 0; i < 6; i++) strokes.push(glyph(100 + i * 30, top, top + 36));
  if (withEquals) strokes.push(bar(300, top + 14), bar(300, top + 24));
  if (withSquare) strokes.push(glyph(132, top - 6, top + 8)); // small superscript ²
  strokes.push(bar(340, top + 18, 10)); // minus sign
  return strokes;
}

test("separates three lines of working and keeps small marks with their line", () => {
  const strokes = [...lineOfWriting(100, { withSquare: true }), ...lineOfWriting(170), ...lineOfWriting(240)];
  const rows = segmentRows(strokes);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.index), [1, 2, 3]);
  assert.equal(rows.reduce((n, r) => n + r.strokeIds.length, 0), strokes.length);
  assert.ok(rows[0].top < rows[1].top && rows[1].top < rows[2].top);
});

test("a dot or bar between lines attaches to the nearest line instead of making a row", () => {
  const strokes = [...lineOfWriting(100), ...lineOfWriting(170), dot(200, 140)];
  assert.equal(segmentRows(strokes).length, 2);
});

test("highlighter strokes are ignored and empty input gives no rows", () => {
  assert.deepEqual(segmentRows([]), []);
  const highlight = { id: ++id, tool: "highlighter", width: 18, points: [{ x: 0, y: 500 }, { x: 300, y: 500 }] };
  assert.equal(segmentRows([...lineOfWriting(100), highlight]).length, 1);
});
