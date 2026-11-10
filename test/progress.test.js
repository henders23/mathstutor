import test from "node:test";
import assert from "node:assert/strict";
import { LESSONS } from "../public/js/lessons/index.js";
import { STORAGE_KEY, cleanItem, clearProgress, loadProgress, parseProgress, saveProgress, serializeProgress } from "../public/js/progress.js";

function memoryStore() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: data,
  };
}

const stroke = (id, pts) => ({ id, tool: "pen", color: "#23262E", width: 3.2, pressureSensitive: true, points: pts.map(([x, y, p]) => ({ x, y, p })) });

const practiceSnapshot = {
  lessonId: "formula",
  mode: "practice",
  demoStep: 0,
  indexByLesson: { factorising: 4, formula: 1 },
  solved: ["p1", "p2", "f1"],
  question: { problemId: "f2", hintsUsed: 2, hints: ["a", "b"], stepReached: 3, shownSteps: 3, stepsShown: 1, complete: false, solvedMessage: "" },
  board: {
    strokes: [stroke(7, [[100.123, 200.456, 0.5123], [110, 210, 0.6]]), stroke(9, [[5, 5, 0.5]])],
    items: [
      { id: 3, progress: 1, duration: 500, layer: "tutor", kind: "line", x: 140, y: 60, size: 40, color: "#1F5FD1", underline: true, segments: [{ text: "Your turn" }] },
      { id: 4, progress: 1, layer: "tutor", kind: "fraction", x: 140, y: 200, size: 28, color: "#1F5FD1", prefix: "x =", num: [{ text: "-b ± " }, { text: "b² - 4ac", root: true }], den: [{ text: "2a" }] },
      { id: 5, progress: 1, layer: "annotation", kind: "mark", type: "tick", x: 300, y: 220, size: 28, color: "#237032" },
    ],
  },
};

test("a practice session round-trips through storage", () => {
  const store = memoryStore();
  assert.equal(saveProgress(practiceSnapshot, store), true);
  const saved = loadProgress(LESSONS, store);
  assert.equal(saved.lessonId, "formula");
  assert.equal(saved.mode, "practice");
  assert.deepEqual(saved.indexByLesson, { factorising: 4, formula: 1 });
  assert.deepEqual(saved.solved, ["p1", "p2", "f1"]);
  assert.equal(saved.question.hintsUsed, 2);
  assert.equal(saved.question.stepReached, 3);
  assert.equal(saved.board.strokes.length, 2);
  assert.deepEqual(saved.board.strokes[0].points[0], { x: 100.1, y: 200.5, p: 0.51 }); // rounded to keep it small
  assert.equal(saved.board.strokes[0].pressureSensitive, true);
  assert.deepEqual(saved.board.items.map((i) => [i.kind, i.layer]), [["line", "tutor"], ["fraction", "tutor"], ["mark", "annotation"]]);
  assert.equal(saved.board.items[0].id, undefined); // runtime fields are not stored
  assert.equal(saved.board.items[1].num[1].root, true);
  clearProgress(store);
  assert.equal(loadProgress(LESSONS, store), null);
});

test("learn mode keeps the demo step and ink but no tutor items", () => {
  const text = serializeProgress({ ...practiceSnapshot, mode: "learn", demoStep: 3, question: null });
  const saved = parseProgress(text, LESSONS);
  assert.equal(saved.mode, "learn");
  assert.equal(saved.demoStep, 3);
  assert.equal(saved.question, null);
  assert.equal(saved.board.strokes.length, 2);
  assert.deepEqual(saved.board.items, []);
});

test("a saved question that no longer matches the current one is dropped", () => {
  const text = serializeProgress({ ...practiceSnapshot, question: { ...practiceSnapshot.question, problemId: "f4" } });
  const saved = parseProgress(text, LESSONS);
  assert.equal(saved.question, null);
  assert.deepEqual(saved.board.items, []);
});

test("bad or tampered data is ignored rather than crashing the app", () => {
  for (const text of ["not json", "null", "{}", JSON.stringify({ v: 2, lessonId: "formula" }), JSON.stringify({ v: 1, lessonId: "nope" })])
    assert.equal(parseProgress(text, LESSONS), null, text);

  const raw = JSON.parse(serializeProgress(practiceSnapshot));
  raw.solved.push("unknown-id", 42);
  raw.indexByLesson.formula = 99;
  raw.demoStep = -1;
  raw.board.strokes.push({ id: 1, tool: "laser", color: "#000000", width: 3, pts: [1, 2, 0.5] });
  raw.board.strokes.push({ id: 2, tool: "pen", color: "red;}", width: 3, pts: [1, 2, 0.5] });
  raw.board.strokes.push({ id: 3, tool: "pen", color: "#000000", width: 3, pts: [1, 2] });
  raw.board.items.push({ kind: "script", x: 1, y: 1 }, { kind: "line", x: 1, y: 1, size: 20, segments: "nope" });
  const saved = parseProgress(JSON.stringify(raw), LESSONS);
  assert.deepEqual(saved.solved, ["p1", "p2", "f1"]);
  assert.equal(saved.indexByLesson.formula, undefined); // out of range, so back to question 1
  assert.equal(saved.question, null); // question 1 isn't the saved "f2"
  assert.equal(saved.demoStep, 0);
  assert.equal(saved.board.strokes.length, 2);
});

test("item cleaning keeps only known fields", () => {
  assert.equal(cleanItem({ kind: "badge", x: 1, y: 2 }), null); // missing label
  assert.deepEqual(cleanItem({ kind: "badge", x: 1, y: 2, label: "3", onclick: "evil()", color: "javascript:" }), { kind: "badge", x: 1, y: 2, label: "3" });
  assert.equal(cleanItem({ kind: "line", x: 1, y: 2, size: 30, segments: [{ text: "x".repeat(301) }] }), null);
});

test("storage failures don't throw", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(loadProgress(LESSONS, broken), null);
  assert.equal(saveProgress(practiceSnapshot, broken), false);
  assert.doesNotThrow(() => clearProgress(broken));
  assert.equal(loadProgress(LESSONS, null), null);
});

test("a huge board drops the drawing but keeps progress", () => {
  const points = Array.from({ length: 4000 }, (_, i) => [i * 1.11, i * 2.22, 0.5]);
  const strokes = Array.from({ length: 400 }, (_, i) => stroke(i + 1, points));
  const text = serializeProgress({ ...practiceSnapshot, board: { strokes, items: [] } });
  assert.ok(text.length < 3_000_000);
  const saved = parseProgress(text, LESSONS);
  assert.deepEqual(saved.solved, ["p1", "p2", "f1"]);
  assert.equal(saved.board.strokes.length, 0);
  assert.equal(STORAGE_KEY, "mathstutor.progress.v1");
});
