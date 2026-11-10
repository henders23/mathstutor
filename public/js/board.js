// The whiteboard: an infinite, pannable, zoomable canvas holding
//  - the student's ink (vector strokes with pressure), and
//  - the tutor's writing (text lines and hand-drawn marks, animated as if written).
// Everything is stored as vectors in board coordinates, so the board can be
// re-rendered at any zoom and exported as a crisp image for Claude.

import { segmentRows, typedRowText } from "./rows.js";

export const HAND_FONT = "Kalam, 'Segoe Print', 'Comic Sans MS', cursive";
const BG = "#FCFCFA";
const GRID = "#EDEFF2";
const GRID_SPACING = 32;
const ERASE_RADIUS = 12;

let idCounter = 1;
const nextId = () => idCounter++;

// Deterministic jitter so hand-drawn shapes look natural but don't wobble between frames.
function seeded(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
}

function fontFor(size, weight = 400) {
  return `${weight} ${size}px ${HAND_FONT}`;
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

function drawPartialPath(ctx, points, fraction) {
  if (points.length < 2 || fraction <= 0) return;
  const target = pathLength(points) * Math.min(fraction, 1);
  let walked = 0;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= target) {
      const t = seg === 0 ? 0 : (target - walked) / seg;
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      break;
    }
    ctx.lineTo(b.x, b.y);
    walked += seg;
  }
  ctx.stroke();
}

function ellipsePoints(cx, cy, rx, ry, seed) {
  const rand = seeded(seed);
  const points = [];
  const start = -2.2;
  const sweep = Math.PI * 2 + 0.35; // overshoot slightly, like a real pen loop
  for (let i = 0; i <= 48; i++) {
    const t = start + (sweep * i) / 48;
    const wobble = 1 + rand() * 0.04;
    points.push({ x: cx + Math.cos(t) * rx * wobble, y: cy + Math.sin(t) * ry * wobble });
  }
  return points;
}

function wavyPoints(x, y, w) {
  const points = [];
  for (let i = 0; i <= Math.max(8, Math.round(w / 6)); i++) {
    const px = x + (w * i) / Math.max(8, Math.round(w / 6));
    points.push({ x: px, y: y + Math.sin(px / 7) * 3.2 });
  }
  return points;
}

function underlinePoints(x, y, w) {
  return [
    { x: x + 2, y: y + 3 },
    { x: x + w * 0.3, y: y - 2 },
    { x: x + w * 0.7, y: y + 2 },
    { x: x + w, y: y - 3 },
  ];
}

function tickPoints(x, y, s) {
  return [
    { x: x - s * 0.5, y: y },
    { x: x - s * 0.12, y: y + s * 0.42 },
    { x: x + s * 0.6, y: y - s * 0.55 },
  ];
}

function crossStrokes(x, y, s) {
  return [
    [
      { x: x - s * 0.45, y: y - s * 0.45 },
      { x: x + s * 0.45, y: y + s * 0.45 },
    ],
    [
      { x: x + s * 0.45, y: y - s * 0.45 },
      { x: x - s * 0.45, y: y + s * 0.45 },
    ],
  ];
}

function boxPoints(x, y, w, h) {
  const r = 12;
  const points = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  points.push({ ...points[0] });
  return points;
}

export class Board {
  // renderMath(el, latex): draws a typed line into el. mathToText(latex): plain-text version for the
  // image sent to Claude. onTypeTap(point, typedLine|null): the Type tool was tapped on the board.
  constructor(
    canvas,
    {
      onInk = () => {},
      onViewChange = () => {},
      renderMath = (el, latex) => (el.textContent = latex),
      mathToText = (latex) => latex,
      onTypeTap = () => {},
    } = {},
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onInk = onInk;
    this.onViewChange = onViewChange;
    this.renderMath = renderMath;
    this.mathToText = mathToText;
    this.onTypeTap = onTypeTap;
    this.typed = [];
    // Typed lines are real DOM (so maths renders properly); this layer follows the board's pan and zoom.
    this.mathLayer = document.createElement("div");
    this.mathLayer.className = "typed-layer";
    canvas.parentElement.appendChild(this.mathLayer);
    this.view = { x: 0, y: 0, scale: 1 };
    this.items = [];
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.tool = "pen";
    this.color = "#23262E";
    this.penWidth = 3.2;
    this.pointers = new Map();
    this.penSeen = false;
    this.live = null;
    this.gesture = null;
    this.spaceDown = false;
    this.animating = false;
    this.frameRequested = false;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.pointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this.pointerUp(e, true));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    if (document.fonts) document.fonts.ready.then(() => this.remeasureTyped());
    this.resize();
  }

  // ---------- view ----------

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.dpr = dpr;
    this.requestRender();
  }

  resetView() {
    // Lessons are laid out for a ~1100px-wide board; shrink to fit smaller screens.
    const scale = Math.max(0.4, Math.min(1, this.width / 1100));
    this.view = { x: 0, y: 0, scale };
    this.onViewChange(this.view);
    this.requestRender();
  }

  toBoard(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.x) / this.view.scale,
      y: (clientY - rect.top - this.view.y) / this.view.scale,
    };
  }

  // Right-hand edge of the board that isn't hidden behind the tutor card.
  visibleRight(reservedPx = 0) {
    return (this.width - reservedPx - this.view.x) / this.view.scale;
  }

  zoomAt(screenX, screenY, factor) {
    const scale = Math.min(3, Math.max(0.35, this.view.scale * factor));
    const k = scale / this.view.scale;
    this.view.x = screenX - (screenX - this.view.x) * k;
    this.view.y = screenY - (screenY - this.view.y) * k;
    this.view.scale = scale;
    this.onViewChange(this.view);
    this.requestRender();
  }

  // ---------- tools ----------

  setTool(tool) {
    this.tool = tool;
    this.canvas.dataset.tool = tool;
  }

  setColor(color) {
    this.color = color;
  }

  // ---------- tutor items ----------

  addItem(item, { animate = true, layer = "tutor" } = {}) {
    const entry = { ...item, id: nextId(), layer, progress: animate ? 0 : 1 };
    entry.duration = item.duration ?? this.estimateDuration(entry);
    this.items.push(entry);
    this.requestRender();
    if (!animate) return Promise.resolve(entry);
    return new Promise((resolve) => {
      entry.resolve = () => resolve(entry);
      this.startAnimation();
    });
  }

  estimateDuration(item) {
    if (item.kind === "line") {
      const chars = item.segments.reduce((n, s) => n + s.text.length, 0);
      const decorated = item.underline || item.box || item.segments.some((s) => s.ring);
      return Math.max(350, chars * 32) + (decorated ? 450 : 0);
    }
    if (item.kind === "fraction") {
      const text = [{ text: item.prefix ?? "" }, ...item.num, ...item.den].reduce((n, s) => n + s.text.length, 0);
      return Math.max(500, text * 34) + 250;
    }
    if (item.kind === "badge") return 200;
    return 450;
  }

  finishAnimations() {
    for (const item of this.items) {
      if (item.progress < 1) {
        item.progress = 1;
        item.resolve?.();
      }
    }
    this.requestRender();
  }

  removeItems(predicate) {
    for (const item of this.items) if (predicate(item) && item.progress < 1) item.resolve?.();
    this.items = this.items.filter((item) => !predicate(item));
    this.requestRender();
  }

  clearLayer(layer) {
    this.removeItems((item) => item.layer === layer);
  }

  startAnimation() {
    if (this.animating) return;
    this.animating = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      last = now;
      let pending = false;
      // Write one item at a time, in order, like a real pen.
      const current = this.items.find((item) => item.progress < 1);
      if (current) {
        current.progress = Math.min(1, current.progress + dt / current.duration);
        if (current.progress >= 1) current.resolve?.();
        pending = this.items.some((item) => item.progress < 1);
      }
      this.render();
      if (pending) requestAnimationFrame(tick);
      else this.animating = false;
    };
    requestAnimationFrame(tick);
  }

  // Lays out text segments left to right. A segment with `root: true` gets room for a √ sign.
  layoutSegments(segments, x0, size, weight = 400) {
    const ctx = this.ctx;
    let x = x0;
    const parts = segments.map((segment) => {
      ctx.font = fontFor(size, segment.weight ?? weight);
      const textWidth = ctx.measureText(segment.text).width;
      const pad = segment.root ? size * 0.46 : 0;
      const width = textWidth + pad + (segment.root ? size * 0.1 : 0);
      const part = { ...segment, x, textX: x + pad, textWidth, width };
      x += width;
      return part;
    });
    return { parts, width: x - x0 };
  }

  layoutLine(item) {
    const { parts, width } = this.layoutSegments(item.segments, item.x, item.size, item.weight);
    return { parts, width, left: item.x, top: item.y, right: item.x + width, bottom: item.y + item.size * 1.15 };
  }

  // "x = numerator / denominator" with a drawn fraction bar.
  layoutFraction(item) {
    const s = item.size;
    const weight = item.weight ?? 400;
    const prefix = this.layoutSegments([{ text: `${item.prefix ?? ""} ` }], item.x, s, weight);
    const barX = item.x + prefix.width + s * 0.1;
    const numWidth = this.layoutSegments(item.num, 0, s, weight).width;
    const denWidth = this.layoutSegments(item.den, 0, s, weight).width;
    const barW = Math.max(numWidth, denWidth) + s * 0.5;
    const barY = item.y + s * 1.25;
    const num = this.layoutSegments(item.num, barX + (barW - numWidth) / 2, s, weight);
    const den = this.layoutSegments(item.den, barX + (barW - denWidth) / 2, s, weight);
    const width = barX + barW - item.x;
    return {
      prefixParts: prefix.parts,
      numParts: num.parts,
      denParts: den.parts,
      barX,
      barW,
      barY,
      prefixBase: barY + s * 0.33,
      numBase: barY - s * 0.3,
      denBase: barY + s * 1.0,
      width,
      left: item.x,
      top: item.y,
      right: item.x + width,
      bottom: barY + s * 1.3,
    };
  }

  itemBounds(item) {
    if (item.kind === "line") {
      const box = this.layoutLine(item);
      const pad = item.box ? 14 : 0;
      return { left: box.left - pad, top: box.top - pad / 2, right: box.right + pad, bottom: box.bottom + pad / 2 };
    }
    if (item.kind === "fraction") {
      const { left, top, right, bottom } = this.layoutFraction(item);
      return { left, top, right, bottom };
    }
    if (item.kind === "badge") return { left: item.x - 14, top: item.y - 14, right: item.x + 14, bottom: item.y + 14 };
    if (item.kind === "mark") {
      const s = item.size ?? 30;
      return { left: item.x - s / 2, top: item.y - s / 2, right: item.x + s / 2, bottom: item.y + s / 2 };
    }
    if (item.kind === "ellipse")
      return { left: item.cx - item.rx, top: item.cy - item.ry, right: item.cx + item.rx, bottom: item.cy + item.ry };
    if (item.kind === "wavy") return { left: item.x, top: item.y - 4, right: item.x + item.w, bottom: item.y + 4 };
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  // ---------- student ink ----------

  // Plain data for saving: the student's strokes and (optionally) the tutor's items.
  exportState({ items = true } = {}) {
    return {
      strokes: this.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })),
      items: items ? this.items.map(({ id, progress, duration, resolve, ...data }) => data) : [],
      typed: this.typed.map((t) => this.typedData(t)),
    };
  }

  // Restores saved strokes and items instantly (no animation). Undo history starts empty.
  importState({ strokes = [], items = [], typed = [] } = {}) {
    for (const stroke of strokes) idCounter = Math.max(idCounter, stroke.id + 1);
    this.strokes = strokes.map((s) => ({ ...s }));
    for (const t of this.typed) t.el.remove();
    this.typed = [];
    for (const t of typed) this.insertTyped(t);
    this.undoStack = [];
    this.redoStack = [];
    for (const { layer = "tutor", ...item } of items) this.addItem(item, { animate: false, layer });
    this.onInk();
    this.requestRender();
  }

  get hasInk() {
    return this.strokes.length > 0;
  }

  // Anything the student has put on the board: handwriting or typed lines.
  get hasWork() {
    return this.strokes.length > 0 || this.typed.length > 0;
  }

  workBounds() {
    const boxes = this.typedBoxes();
    const ink = this.inkBounds();
    if (ink) boxes.push(ink);
    if (!boxes.length) return null;
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      top: Math.min(...boxes.map((b) => b.top)),
      right: Math.max(...boxes.map((b) => b.right)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
  }

  inkBounds() {
    if (!this.strokes.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const stroke of this.strokes)
      for (const p of stroke.points) {
        left = Math.min(left, p.x);
        top = Math.min(top, p.y);
        right = Math.max(right, p.x);
        bottom = Math.max(bottom, p.y);
      }
    return { left, top, right, bottom };
  }

  // Lowest point of everything on the board (tutor writing and ink).
  contentBottom() {
    let bottom = 0;
    for (const item of this.items) bottom = Math.max(bottom, this.itemBounds(item).bottom);
    const work = this.workBounds();
    if (work) bottom = Math.max(bottom, work.bottom);
    return bottom;
  }

  rows() {
    return segmentRows(this.strokes, this.typedBoxes());
  }

  // Exact typed content per row, for Claude: [{ row, latex }].
  typedRows(rows) {
    return typedRowText(rows, this.typed);
  }

  // ---------- typed maths lines ----------

  typedData(t) {
    return { id: t.id, latex: t.latex, x: t.x, y: t.y };
  }

  insertTyped(data) {
    const entry = { ...data, w: 40, h: 40 };
    idCounter = Math.max(idCounter, entry.id + 1);
    entry.el = document.createElement("div");
    entry.el.className = "typed-line";
    this.mathLayer.appendChild(entry.el);
    this.typed.push(entry);
    this.typed.sort((a, b) => a.id - b.id);
    this.refreshTyped(entry);
    return entry;
  }

  refreshTyped(entry) {
    this.renderMath(entry.el, entry.latex);
    entry.el.style.left = `${entry.x}px`;
    entry.el.style.top = `${entry.y}px`;
    this.measureTyped(entry);
  }

  measureTyped(entry) {
    if (!entry.el.isConnected || entry.el.hidden) return;
    entry.w = Math.max(entry.el.offsetWidth, 20);
    entry.h = Math.max(entry.el.offsetHeight, 20);
  }

  remeasureTyped() {
    for (const t of this.typed) this.measureTyped(t);
    this.requestRender();
  }

  deleteTyped(id) {
    const entry = this.typedById(id);
    if (!entry) return;
    entry.el.remove();
    this.typed = this.typed.filter((t) => t.id !== id);
  }

  typedById(id) {
    return this.typed.find((t) => t.id === id) ?? null;
  }

  typedBoxes() {
    return this.typed.map((t) => {
      this.measureTyped(t);
      return { id: t.id, left: t.x, top: t.y, right: t.x + t.w, bottom: t.y + t.h };
    });
  }

  typedAt(point, slack = 6) {
    for (let i = this.typed.length - 1; i >= 0; i--) {
      const t = this.typed[i];
      if (point.x >= t.x - slack && point.x <= t.x + t.w + slack && point.y >= t.y - slack && point.y <= t.y + t.h + slack) return t;
    }
    return null;
  }

  addTyped({ latex, x, y }) {
    const entry = this.insertTyped({ id: nextId(), latex, x, y });
    this.pushHistory({ type: "typed-add", items: [this.typedData(entry)] });
    return entry;
  }

  updateTyped(id, changes) {
    const entry = this.typedById(id);
    if (!entry) return null;
    const before = this.typedData(entry);
    Object.assign(entry, changes);
    this.refreshTyped(entry);
    this.pushHistory({ type: "typed-change", before, after: this.typedData(entry) });
    return entry;
  }

  removeTyped(ids) {
    const items = ids.map((id) => this.typedById(id)).filter(Boolean).map((t) => this.typedData(t));
    if (!items.length) return;
    for (const item of items) this.deleteTyped(item.id);
    this.pushHistory({ type: "typed-remove", items });
  }

  // Hide a line while its editor is open over it.
  setTypedHidden(id, hidden) {
    const entry = this.typedById(id);
    if (entry) entry.el.hidden = hidden;
  }

  pushHistory(op) {
    this.undoStack.push(op);
    this.redoStack = [];
    this.onInk();
  }

  applyOp(op, direction) {
    const forward = direction === "redo";
    if (op.type === "batch") {
      for (const inner of forward ? op.ops : [...op.ops].reverse()) this.applyOp(inner, direction);
      return;
    }
    if (op.type === "typed-add" || op.type === "typed-remove") {
      const adding = (op.type === "typed-add") === forward;
      for (const item of op.items) adding ? this.insertTyped(item) : this.deleteTyped(item.id);
      return;
    }
    if (op.type === "typed-change") {
      const entry = this.typedById(op.after.id);
      if (entry) {
        Object.assign(entry, forward ? op.after : op.before);
        this.refreshTyped(entry);
      }
      return;
    }
    const adding = (op.type === "add") === forward;
    if (adding) {
      this.strokes.push(...op.strokes);
      this.strokes.sort((a, b) => a.id - b.id);
    } else {
      const ids = new Set(op.strokes.map((s) => s.id));
      this.strokes = this.strokes.filter((s) => !ids.has(s.id));
    }
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    this.applyOp(op, "undo");
    this.redoStack.push(op);
    this.onInk();
    this.requestRender();
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    this.applyOp(op, "redo");
    this.undoStack.push(op);
    this.onInk();
    this.requestRender();
  }

  clearInk({ record = true } = {}) {
    if (!this.hasWork) return;
    const ops = [];
    if (this.strokes.length) ops.push({ type: "remove", strokes: [...this.strokes] });
    if (this.typed.length) ops.push({ type: "typed-remove", items: this.typed.map((t) => this.typedData(t)) });
    for (const t of this.typed) t.el.remove();
    this.typed = [];
    this.strokes = [];
    if (record) this.pushHistory(ops.length === 1 ? ops[0] : { type: "batch", ops });
    if (!record) {
      this.undoStack = [];
      this.redoStack = [];
      this.onInk();
    }
    this.requestRender();
  }

  // ---------- pointer input ----------

  pointerDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === "pen") this.penSeen = true;
    const touches = [...this.pointers.values()].filter((p) => p.type === "touch");

    if (touches.length >= 2) {
      // Two fingers: pinch/pan. Drop any stroke the first finger started.
      if (this.live?.kind === "stroke") this.live = null;
      this.startPinch();
      return;
    }
    const wantsPan =
      e.button === 1 || this.tool === "hand" || this.spaceDown || (e.pointerType === "touch" && this.penSeen);
    if (wantsPan) {
      this.gesture = { type: "pan", id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 2) return;
    const point = this.toBoard(e.clientX, e.clientY);
    // Pen eraser end / barrel button reports buttons & 32.
    if (this.tool === "type") {
      const hit = this.typedAt(point);
      this.live = { kind: "type", id: e.pointerId, start: point, hit, moved: false, origin: hit && { x: hit.x, y: hit.y } };
      return;
    }
    if (this.tool === "eraser" || (e.buttons & 32) === 32) {
      this.live = { kind: "erase", id: e.pointerId, removed: [], removedTyped: [] };
      this.eraseAt(point);
      return;
    }
    const highlighter = this.tool === "highlighter";
    this.live = {
      kind: "stroke",
      id: e.pointerId,
      stroke: {
        id: nextId(),
        tool: highlighter ? "highlighter" : "pen",
        color: this.color,
        width: highlighter ? 18 : this.penWidth,
        pressureSensitive: e.pointerType === "pen",
        points: [{ ...point, p: this.pressure(e) }],
      },
    };
    this.requestRender();
  }

  pressure(e) {
    return e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
  }

  pointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.gesture?.type === "pinch") return this.updatePinch();
    if (this.gesture?.type === "pan" && this.gesture.id === e.pointerId) {
      this.view.x += e.clientX - this.gesture.x;
      this.view.y += e.clientY - this.gesture.y;
      this.gesture.x = e.clientX;
      this.gesture.y = e.clientY;
      this.onViewChange(this.view);
      return this.requestRender();
    }
    if (!this.live || this.live.id !== e.pointerId) return;
    if (this.live.kind === "type") {
      const { hit, start, origin } = this.live;
      if (!hit) return;
      const point = this.toBoard(e.clientX, e.clientY);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!this.live.moved && Math.hypot(dx, dy) * this.view.scale < 6) return;
      // Drag a typed line to move it.
      this.live.moved = true;
      hit.x = origin.x + dx;
      hit.y = origin.y + dy;
      hit.el.style.left = `${hit.x}px`;
      hit.el.style.top = `${hit.y}px`;
      return;
    }
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const point = this.toBoard(ev.clientX, ev.clientY);
      if (this.live.kind === "erase") this.eraseAt(point);
      else {
        const pts = this.live.stroke.points;
        const last = pts[pts.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) * this.view.scale < 0.8) continue;
        pts.push({ ...point, p: this.pressure(ev) });
      }
    }
    this.requestRender();
  }

  pointerUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.gesture?.type === "pinch") {
      if ([...this.pointers.values()].filter((p) => p.type === "touch").length < 2) this.gesture = null;
      return;
    }
    if (this.gesture?.id === e.pointerId) {
      this.gesture = null;
      return;
    }
    if (!this.live || this.live.id !== e.pointerId) return;
    const live = this.live;
    this.live = null;
    if (live.kind === "type") {
      const { hit, origin } = live;
      if (live.moved && hit) {
        if (cancelled) Object.assign(hit, origin);
        const moved = { ...this.typedData(hit) };
        Object.assign(hit, origin);
        if (!cancelled) this.updateTyped(hit.id, { x: moved.x, y: moved.y });
        else this.refreshTyped(hit);
      } else if (!cancelled) {
        this.onTypeTap(live.start, hit);
      }
      return;
    }
    if (live.kind === "erase") {
      const ops = [];
      if (live.removed.length) ops.push({ type: "remove", strokes: live.removed });
      if (live.removedTyped.length) ops.push({ type: "typed-remove", items: live.removedTyped });
      if (ops.length) this.pushHistory(ops.length === 1 ? ops[0] : { type: "batch", ops });
    } else if (!cancelled) {
      this.strokes.push(live.stroke);
      this.pushHistory({ type: "add", strokes: [live.stroke] });
    }
    this.requestRender();
  }

  startPinch() {
    const [a, b] = [...this.pointers.values()].filter((p) => p.type === "touch");
    this.gesture = {
      type: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  updatePinch() {
    const touches = [...this.pointers.values()].filter((p) => p.type === "touch");
    if (touches.length < 2) return;
    const [a, b] = touches;
    const rect = this.canvas.getBoundingClientRect();
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    this.view.x += cx - this.gesture.cx;
    this.view.y += cy - this.gesture.cy;
    if (this.gesture.distance > 0) this.zoomAt(cx - rect.left, cy - rect.top, distance / this.gesture.distance);
    Object.assign(this.gesture, { distance, cx, cy });
    this.requestRender();
  }

  wheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01));
    } else {
      this.view.x -= e.deltaX;
      this.view.y -= e.deltaY;
      this.onViewChange(this.view);
      this.requestRender();
    }
  }

  eraseAt(point) {
    const radius = ERASE_RADIUS / this.view.scale;
    const typedHit = this.typedAt(point, radius);
    if (typedHit) {
      this.live.removedTyped.push(this.typedData(typedHit));
      this.deleteTyped(typedHit.id);
    }
    const hit = this.strokes.filter((stroke) => strokeHit(stroke, point, radius + stroke.width / 2));
    if (!hit.length) return;
    const ids = new Set(hit.map((s) => s.id));
    this.strokes = this.strokes.filter((s) => !ids.has(s.id));
    this.live.removed.push(...hit);
    this.requestRender();
  }

  // ---------- rendering ----------

  requestRender() {
    if (this.frameRequested || this.animating) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.render();
    });
  }

  render() {
    const { ctx, dpr, view } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid();
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
    this.mathLayer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    for (const stroke of this.strokes) if (stroke.tool === "highlighter") drawStroke(ctx, stroke);
    if (this.live?.kind === "stroke" && this.live.stroke.tool === "highlighter") drawStroke(ctx, this.live.stroke);
    for (const item of this.items) this.drawItem(item);
    for (const stroke of this.strokes) if (stroke.tool !== "highlighter") drawStroke(ctx, stroke);
    if (this.live?.kind === "stroke" && this.live.stroke.tool !== "highlighter") drawStroke(ctx, this.live.stroke);
  }

  drawGrid() {
    const { ctx, view } = this;
    const step = GRID_SPACING * view.scale;
    if (step < 8) return;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((view.x % step) + step) % step; x < this.width; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, this.height);
    }
    for (let y = ((view.y % step) + step) % step; y < this.height; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(this.width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  drawItem(item) {
    const ctx = this.ctx;
    const p = item.progress;
    if (p <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = item.color ?? "#1F5FD1";
    ctx.fillStyle = item.color ?? "#1F5FD1";
    ctx.lineWidth = item.lineWidth ?? 2.6;

    if (item.kind === "line") this.drawLine(item, p);
    else if (item.kind === "fraction") this.drawFraction(item, p);
    else if (item.kind === "badge") {
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.beginPath();
      ctx.arc(item.x, item.y, 14, 0, Math.PI * 2);
      if (item.active) {
        ctx.fillStyle = "#1F5FD1";
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else {
        ctx.strokeStyle = "#9DB6E8";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#1F5FD1";
      }
      ctx.font = "700 14px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, item.x, item.y + 1);
    } else if (item.kind === "mark") {
      const s = item.size ?? 30;
      ctx.lineWidth = item.lineWidth ?? 3.4;
      if (item.type === "tick") drawPartialPath(ctx, tickPoints(item.x, item.y, s), p);
      else {
        const [one, two] = crossStrokes(item.x, item.y, s);
        drawPartialPath(ctx, one, p * 2);
        drawPartialPath(ctx, two, p * 2 - 1);
      }
    } else if (item.kind === "ellipse") {
      drawPartialPath(ctx, ellipsePoints(item.cx, item.cy, item.rx, item.ry, item.id), p);
    } else if (item.kind === "wavy") {
      drawPartialPath(ctx, wavyPoints(item.x, item.y, item.w), p);
    }
    ctx.restore();
  }

  drawLine(item, p) {
    const ctx = this.ctx;
    const layout = this.layoutLine(item);
    const decorated = item.underline || item.box || item.segments.some((s) => s.ring);
    const textP = decorated ? Math.min(1, p / 0.75) : p;
    const decoP = decorated ? Math.max(0, (p - 0.75) / 0.25) : 0;
    const baseline = item.y + item.size * 0.85;

    ctx.save();
    ctx.beginPath();
    ctx.rect(item.x - 4, item.y - item.size, layout.width * textP + 8, item.size * 3);
    ctx.clip();
    this.drawParts(layout.parts, baseline, item);
    for (const part of layout.parts) {
      if (!part.strike) continue;
      ctx.strokeStyle = part.color ?? item.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(part.x - 2, item.y + item.size * 0.55);
      ctx.lineTo(part.x + part.width + 2, item.y + item.size * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    if (decoP <= 0) return;
    ctx.lineWidth = 2.6;
    for (const part of layout.parts) {
      if (!part.ring) continue;
      ctx.strokeStyle = part.ring;
      const cx = part.x + part.width / 2;
      const cy = item.y + item.size * 0.55;
      drawPartialPath(ctx, ellipsePoints(cx, cy, part.width / 2 + 16, item.size * 0.62, item.id), decoP);
    }
    ctx.strokeStyle = item.color;
    if (item.underline) drawPartialPath(ctx, underlinePoints(item.x, item.y + item.size * 1.12, layout.width), decoP);
    if (item.box) {
      ctx.lineWidth = 2.6;
      drawPartialPath(ctx, boxPoints(item.x - 16, item.y - 8, layout.width + 32, item.size * 1.3 + 8), decoP);
    }
  }

  drawParts(parts, baseline, item) {
    const ctx = this.ctx;
    const size = item.size;
    ctx.textBaseline = "alphabetic";
    for (const part of parts) {
      const color = part.color ?? item.color;
      ctx.font = fontFor(size, part.weight ?? item.weight ?? 400);
      ctx.fillStyle = color;
      ctx.fillText(part.text, part.textX, baseline);
      if (part.root) {
        // Hand-drawn radical: small tick, down stroke, long up stroke, then the bar over the contents.
        const x = part.x;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.8, size * 0.075);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x + size * 0.04, baseline - size * 0.3);
        ctx.lineTo(x + size * 0.14, baseline - size * 0.37);
        ctx.lineTo(x + size * 0.27, baseline + size * 0.06);
        ctx.lineTo(x + size * 0.4, baseline - size * 0.86);
        ctx.lineTo(part.textX + part.textWidth + size * 0.06, baseline - size * 0.88);
        ctx.stroke();
      }
    }
  }

  drawFraction(item, p) {
    const ctx = this.ctx;
    const layout = this.layoutFraction(item);
    ctx.save();
    ctx.beginPath();
    ctx.rect(item.x - 4, item.y - item.size, layout.width * p + 8, item.size * 5);
    ctx.clip();
    this.drawParts(layout.prefixParts, layout.prefixBase, item);
    this.drawParts(layout.numParts, layout.numBase, item);
    this.drawParts(layout.denParts, layout.denBase, item);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = Math.max(2, item.size * 0.08);
    ctx.beginPath();
    ctx.moveTo(layout.barX, layout.barY + 1);
    ctx.quadraticCurveTo(layout.barX + layout.barW / 2, layout.barY - 2, layout.barX + layout.barW, layout.barY);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- export for Claude ----------

  // Renders the student's ink (only) on white, with grey row labels R1, R2, … in the margin.
  exportInk(rows = this.rows()) {
    const bounds = this.workBounds();
    if (!bounds) return null;
    const pad = 28;
    const margin = 64;
    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    const scale = Math.max(0.5, Math.min(2, 1400 / Math.max(w, h, 1)));
    const width = Math.ceil(w * scale + pad * 2 + margin);
    const height = Math.ceil(h * scale + pad * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    const toX = (x) => margin + pad + (x - bounds.left) * scale;
    const toY = (y) => pad + (y - bounds.top) * scale;

    ctx.fillStyle = "#9AA0A6";
    ctx.font = "600 20px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const row of rows) ctx.fillText(`R${row.index}`, 10, toY((row.top + row.bottom) / 2));

    // Map board coordinates straight into the export: x → toX(x), y → toY(y).
    ctx.setTransform(scale, 0, 0, scale, toX(0), toY(0));
    for (const stroke of this.strokes) drawStroke(ctx, stroke);
    // Typed lines: a light dashed box with their plain-text form (the exact LaTeX goes to Claude separately).
    for (const t of this.typed) {
      ctx.save();
      ctx.strokeStyle = "#B8C4D6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(t.x - 4, t.y - 2, t.w + 8, t.h + 4);
      ctx.fillStyle = "#1E3A8A";
      ctx.font = "500 24px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(this.mathToText(t.latex), t.x + 4, t.y + t.h / 2);
      ctx.restore();
    }
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  }
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function strokeHit(stroke, point, radius) {
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(pts[0].x - point.x, pts[0].y - point.y) <= radius;
  for (let i = 1; i < pts.length; i++) if (distanceToSegment(point, pts[i - 1], pts[i]) <= radius) return true;
  return false;
}

function drawStroke(ctx, stroke) {
  const pts = stroke.points;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const widthAt = (p) => (stroke.pressureSensitive ? stroke.width * (0.45 + p.p * 1.1) : stroke.width);
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, widthAt(pts[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (!stroke.pressureSensitive) {
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  } else {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = (widthAt(pts[i - 1]) + widthAt(pts[i])) / 2;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
