// Typing maths on the board: MathLive input boxes placed on the whiteboard, plus a symbol
// keypad that appears only while a box is active.

import { isSafeLatex } from "./mathtext.js";

const MATHLIVE_URL = "/vendor/mathlive/mathlive.min.mjs";

let mathlive = null;

// Loads MathLive once. Resolves to null if it can't be loaded (typing is then switched off).
export async function loadMathLive() {
  if (mathlive) return mathlive;
  try {
    mathlive = await import(MATHLIVE_URL);
    mathlive.MathfieldElement.fontsDirectory = "/vendor/mathlive/fonts";
    mathlive.MathfieldElement.soundsDirectory = null; // no keypress sounds
    return mathlive;
  } catch (error) {
    console.warn("MathLive couldn't be loaded; typing is disabled.", error);
    return null;
  }
}

// Static rendering for committed lines. Unsafe or unrenderable LaTeX is shown as plain text.
export function renderMath(el, latex) {
  if (mathlive && isSafeLatex(latex)) {
    try {
      el.innerHTML = mathlive.convertLatexToMarkup(latex);
      return;
    } catch {}
  }
  el.textContent = latex;
}

export function mathToText(latex) {
  if (mathlive) {
    try {
      return mathlive
        .convertLatexToAsciiMath(latex)
        .replace(/"/g, "")
        .replace(/(^|[^a-z])o r(?![a-z])/gi, "$1 or "); // \mathrm{or} comes out as "o r"
    } catch {}
  }
  return latex;
}

// "or" is upright text inside maths mode, so typing carries on in maths afterwards.
// Keypad keys. `insert` uses MathLive placeholders: #@ = what's just before the caret, #? = an empty box.
const KEYS = [
  { label: "x", insert: "x" },
  { label: "x²", insert: "x^2", aria: "x squared" },
  { label: "□²", insert: "#@^2", aria: "squared" },
  { label: "□ⁿ", insert: "#@^{#?}", aria: "power" },
  { label: "√", insert: "\\sqrt{#?}", aria: "square root" },
  { label: "a⁄b", insert: "\\frac{#@}{#?}", aria: "fraction" },
  { label: "±", insert: "\\pm", aria: "plus or minus" },
  { label: "×", insert: "\\times", aria: "times" },
  { label: "÷", insert: "\\div", aria: "divide" },
  { label: "(", insert: "(", aria: "open bracket" },
  { label: ")", insert: ")", aria: "close bracket" },
  { label: "+", insert: "+", aria: "plus" },
  { label: "−", insert: "-", aria: "minus" },
  { label: "=", insert: "=", aria: "equals" },
  { label: "or", insert: "\\;\\mathrm{or}\\;", aria: "or" },
  { label: "←", command: "moveToPreviousChar", aria: "move left" },
  { label: "→", command: "moveToNextChar", aria: "move right" },
  { label: "⌫", command: "deleteBackward", aria: "delete" },
  { label: "New line", action: "next", kind: "wide" },
  { label: "Done", action: "done", kind: "wide primary" },
];

export class TypeEditor {
  // board: the Board. keypad: the keypad container. onOpen/onClose: a box was opened/closed.
  constructor(board, keypad, { onOpen = () => {}, onClose = () => {} } = {}) {
    this.board = board;
    this.keypad = keypad;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.field = null; // the live <math-field>
    this.editing = null; // { id|null, x, y }
    this.buildKeypad();
    window.visualViewport?.addEventListener("resize", () => this.placeKeypad());
    window.visualViewport?.addEventListener("scroll", () => this.placeKeypad());
  }

  get open() {
    return Boolean(this.field);
  }

  buildKeypad() {
    const row = document.createElement("div");
    row.className = "keypad-keys";
    for (const key of KEYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `key ${key.kind ?? ""}`.trim();
      btn.textContent = key.label;
      if (key.aria) btn.setAttribute("aria-label", key.aria);
      // Keep focus (and the caret) in the maths box when a key is pressed.
      btn.addEventListener("pointerdown", (e) => e.preventDefault());
      btn.addEventListener("click", () => this.press(key));
      row.append(btn);
    }
    this.keypad.replaceChildren(row);
  }

  press(key) {
    if (!this.field) return;
    if (key.action === "done") return this.commit();
    if (key.action === "next") return this.commit({ next: true });
    if (key.command) this.field.executeCommand(key.command);
    else this.field.insert(key.insert, { focus: true, scrollIntoView: true, selectionMode: "placeholder" });
    this.field.focus();
  }

  placeKeypad() {
    const vv = window.visualViewport;
    // Sit above the on-screen keyboard when there is one.
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    this.keypad.style.bottom = `${covered + 12}px`;
  }

  // Opens a box at board point (x, y), or over an existing typed line to edit it.
  openAt({ x, y, line = null }) {
    if (!mathlive) return;
    if (this.field) this.commit();
    const field = new mathlive.MathfieldElement();
    field.className = "typed-editor";
    field.setAttribute("aria-label", "Type maths");
    field.setAttribute("math-virtual-keyboard-policy", "manual"); // we show our own keypad instead
    const pos = line ? { x: line.x, y: line.y } : { x, y };
    field.style.left = `${pos.x}px`;
    field.style.top = `${pos.y}px`;
    // MathLive only accepts most settings once the box is on the page.
    this.board.mathLayer.append(field);
    field.mathVirtualKeyboardPolicy = "manual";
    field.popoverPolicy = "off";
    field.menuItems = [];
    field.smartFence = true;
    field.inlineShortcuts = { ...field.inlineShortcuts, or: "\\;\\mathrm{or}\\;", "+-": "\\pm" };
    if (line) {
      field.value = line.latex;
      this.board.setTypedHidden(line.id, true);
    }
    this.field = field;
    this.editing = { id: line?.id ?? null, ...pos };

    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.commit({ next: true });
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });
    field.addEventListener("blur", () => {
      // Tapping elsewhere commits. (Keypad keys don't take focus, so they don't trigger this.)
      setTimeout(() => {
        if (this.field === field && !field.hasFocus()) this.commit();
      }, 0);
    });

    this.keypad.hidden = false;
    this.placeKeypad();
    this.onOpen();
    // Focus can be stolen while the page rearranges (the dock hides), so make sure it lands.
    const focus = () => this.field === field && !field.hasFocus() && field.focus();
    requestAnimationFrame(focus);
    setTimeout(focus, 60);
    setTimeout(focus, 200);
  }

  commit({ next = false } = {}) {
    const field = this.field;
    if (!field) return;
    const latex = field.getValue("latex-without-placeholders").trim();
    const { id, x, y } = this.editing;
    this.close();
    let entry = null;
    if (id !== null) {
      const existing = this.board.typedById(id);
      this.board.setTypedHidden(id, false);
      if (!latex) this.board.removeTyped([id]);
      else if (existing && latex !== existing.latex) entry = this.board.updateTyped(id, { latex });
      else entry = existing;
    } else if (latex) {
      entry = this.board.addTyped({ latex, x, y });
    }
    if (next) {
      const below = entry ? entry.y + entry.h + 18 : y + 56;
      this.openAt({ x: entry?.x ?? x, y: below });
    }
  }

  cancel() {
    if (!this.field) return;
    const { id } = this.editing;
    this.close();
    if (id !== null) this.board.setTypedHidden(id, false);
  }

  close() {
    const field = this.field;
    this.field = null;
    this.editing = null;
    field?.remove();
    this.keypad.hidden = true;
    this.onClose();
  }
}
