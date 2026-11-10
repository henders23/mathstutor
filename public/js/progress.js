// Saves the learner's progress in this browser (localStorage) so it survives a reload:
// which lesson and screen they're on, solved questions, and the work on the board.
// Everything read back is validated, so a corrupted or hand-edited entry can't break the app.

export const STORAGE_KEY = "mathstutor.progress.v1";
const MAX_CHARS = 3_000_000; // stay well inside the ~5 MB localStorage budget
const MAX_STROKES = 4000;
const MAX_POINTS = 4000;
const MAX_ITEMS = 400;
const MAX_TYPED = 200;
const MAX_LATEX = 1000;

const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= min && v <= max;
const round = (v, f) => Math.round(v * f) / f;

// ---------- strokes: points are stored flat ([x, y, p, x, y, p, …]) to keep the entry small ----------

function packStroke(stroke) {
  const flat = [];
  for (const p of stroke.points) flat.push(round(p.x, 10), round(p.y, 10), round(p.p ?? 0.5, 100));
  return { id: stroke.id, tool: stroke.tool, color: stroke.color, width: stroke.width, pen: stroke.pressureSensitive, pts: flat };
}

function unpackStroke(raw) {
  if (!raw || !isInt(raw.id, 1) || !["pen", "highlighter"].includes(raw.tool) || !isHex(raw.color)) return null;
  if (!isNum(raw.width) || raw.width <= 0 || raw.width > 60) return null;
  if (!Array.isArray(raw.pts) || raw.pts.length < 3 || raw.pts.length % 3 !== 0 || raw.pts.length > MAX_POINTS * 3) return null;
  if (!raw.pts.every(isNum)) return null;
  const points = [];
  for (let i = 0; i < raw.pts.length; i += 3) points.push({ x: raw.pts[i], y: raw.pts[i + 1], p: Math.min(1, Math.max(0, raw.pts[i + 2])) });
  return { id: raw.id, tool: raw.tool, color: raw.color, width: raw.width, pressureSensitive: raw.pen === true, points };
}

// ---------- tutor items (text lines, fractions, badges, marks) ----------

const NUM_KEYS = ["x", "y", "size", "weight", "cx", "cy", "rx", "ry", "w", "lineWidth"];
const REQUIRED = {
  line: ["x", "y", "size", "segments"],
  fraction: ["x", "y", "size", "num", "den"],
  badge: ["x", "y", "label"],
  mark: ["x", "y", "type"],
  ellipse: ["cx", "cy", "rx", "ry"],
  wavy: ["x", "y", "w"],
};

function cleanSegments(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 20) return null;
  const out = [];
  for (const s of list) {
    if (!s || typeof s.text !== "string" || s.text.length > 300) return null;
    const seg = { text: s.text };
    if (isHex(s.color)) seg.color = s.color;
    if (isHex(s.ring)) seg.ring = s.ring;
    if (isNum(s.weight)) seg.weight = s.weight;
    if (s.root === true) seg.root = true;
    if (s.strike === true) seg.strike = true;
    out.push(seg);
  }
  return out;
}

export function cleanItem(raw) {
  if (!raw || !Object.hasOwn(REQUIRED, raw.kind)) return null;
  const item = { kind: raw.kind };
  for (const key of NUM_KEYS) if (isNum(raw[key])) item[key] = raw[key];
  if (isHex(raw.color)) item.color = raw.color;
  if (raw.layer === "tutor" || raw.layer === "annotation") item.layer = raw.layer;
  if (isInt(raw.demoStep, 1, 20)) item.demoStep = raw.demoStep;
  for (const flag of ["underline", "box", "active"]) if (raw[flag] === true) item[flag] = true;
  if (typeof raw.label === "string" && raw.label.length <= 3) item.label = raw.label;
  if (raw.type === "tick" || raw.type === "cross") item.type = raw.type;
  if (typeof raw.prefix === "string" && raw.prefix.length <= 20) item.prefix = raw.prefix;
  for (const key of ["segments", "num", "den"]) {
    if (raw[key] === undefined) continue;
    const segments = cleanSegments(raw[key]);
    if (!segments) return null;
    item[key] = segments;
  }
  return REQUIRED[item.kind].every((key) => item[key] !== undefined) ? item : null;
}

function packItem(item) {
  const { id, progress, duration, resolve, ...data } = item; // drop runtime-only fields
  return data;
}

// ---------- typed maths lines ----------

function cleanTyped(raw) {
  if (!raw || !isInt(raw.id, 1) || typeof raw.latex !== "string" || !raw.latex || raw.latex.length > MAX_LATEX) return null;
  if (!isNum(raw.x) || !isNum(raw.y)) return null;
  return { id: raw.id, latex: raw.latex, x: round(raw.x, 10), y: round(raw.y, 10) };
}

// ---------- whole snapshot ----------

// snapshot: { lessonId, mode, demoStep, indexByLesson, solved, question, board: { strokes, items } }
export function serializeProgress(snapshot) {
  const board = {
    strokes: (snapshot.board?.strokes ?? []).slice(0, MAX_STROKES).map(packStroke),
    items: (snapshot.board?.items ?? []).slice(0, MAX_ITEMS).map(packItem),
    typed: (snapshot.board?.typed ?? []).slice(0, MAX_TYPED).map(cleanTyped).filter(Boolean),
  };
  const data = { v: 1, ...snapshot, board };
  let text = JSON.stringify(data);
  if (text.length > MAX_CHARS) text = JSON.stringify({ ...data, board: { strokes: [], items: [], typed: [] } }); // too big: keep progress, drop the drawing
  return text;
}

// Returns a clean snapshot, or null when there's nothing usable.
export function parseProgress(text, lessons) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1) return null;
  const lesson = lessons.find((l) => l.id === raw.lessonId);
  if (!lesson) return null;

  const knownIds = new Set(lessons.flatMap((l) => l.practice.map((p) => p.id)));
  const solved = Array.isArray(raw.solved) ? raw.solved.filter((id) => knownIds.has(id)) : [];
  const indexByLesson = {};
  for (const l of lessons) {
    const index = raw.indexByLesson?.[l.id];
    if (isInt(index, 0, l.practice.length - 1)) indexByLesson[l.id] = index;
  }
  const mode = raw.mode === "practice" ? "practice" : "learn";
  const demoStep = isInt(raw.demoStep, 0, lesson.demo.steps.length) ? raw.demoStep : 0;

  let question = null;
  const q = raw.question;
  const current = lesson.practice[indexByLesson[lesson.id] ?? 0];
  if (mode === "practice" && q && q.problemId === current.id) {
    question = {
      problemId: q.problemId,
      hintsUsed: isInt(q.hintsUsed, 0, 3) ? q.hintsUsed : 0,
      hints: Array.isArray(q.hints) ? q.hints.filter((h) => typeof h === "string").slice(0, 3).map((h) => h.slice(0, 600)) : [],
      stepReached: isInt(q.stepReached, 0, 5) ? q.stepReached : 0,
      shownSteps: isInt(q.shownSteps, 0, 5) ? q.shownSteps : 0,
      stepsShown: isInt(q.stepsShown, 0, 5) ? q.stepsShown : 0,
      complete: q.complete === true,
      solvedMessage: typeof q.solvedMessage === "string" ? q.solvedMessage.slice(0, 600) : "",
    };
  }

  const strokes = (Array.isArray(raw.board?.strokes) ? raw.board.strokes : []).slice(0, MAX_STROKES).map(unpackStroke).filter(Boolean);
  const items = (Array.isArray(raw.board?.items) ? raw.board.items : []).slice(0, MAX_ITEMS).map(cleanItem).filter(Boolean);
  const typed = (Array.isArray(raw.board?.typed) ? raw.board.typed : []).slice(0, MAX_TYPED).map(cleanTyped).filter(Boolean);
  return {
    lessonId: lesson.id,
    mode,
    demoStep,
    indexByLesson,
    solved,
    question,
    // Board items are only reused when we're resuming the same practice question.
    board: { strokes, typed, items: question ? items : [] },
  };
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // e.g. storage blocked in a private window
  }
}

export function loadProgress(lessons, store = storage()) {
  try {
    const text = store?.getItem(STORAGE_KEY);
    return text ? parseProgress(text, lessons) : null;
  } catch {
    return null;
  }
}

export function saveProgress(snapshot, store = storage()) {
  try {
    store?.setItem(STORAGE_KEY, serializeProgress(snapshot));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable: the app carries on without saving
  }
}

export function clearProgress(store = storage()) {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {}
}
