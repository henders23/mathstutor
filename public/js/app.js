// App controller: the Learn (demo) and Try it (practice) flows around the whiteboard.

import { Board } from "./board.js";
import { INK, LESSONS } from "./lessons/index.js";
import { LEFT } from "./lessons/common.js";
import { clearProgress, loadProgress, saveProgress } from "./progress.js";

// ---------- tiny DOM helpers (text always goes in via textContent) ----------

const $ = (id) => document.getElementById(id);

const ICONS = {
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"></path><path d="M14 7l3 3"></path>',
  bulb: '<path d="M9 18h6"></path><path d="M10 21h4"></path><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  left: '<path d="M15 18l-6-6 6-6"></path>',
  right: '<path d="M9 18l6-6-6-6"></path>',
  arrow: '<path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path>',
  step: '<path d="M4 18h5v-5h5V8h6"></path>',
};

function icon(name, size = 18, stroke = "currentColor", width = 2) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    "stroke-width": width,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(k, v);
  svg.innerHTML = ICONS[name]; // trusted constant markup only
  return svg;
}

function circleIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    kind === "now"
      ? '<circle cx="12" cy="12" r="7" fill="none" stroke="#1F5FD1" stroke-width="2"></circle><circle cx="12" cy="12" r="3" fill="#1F5FD1"></circle>'
      : '<circle cx="12" cy="12" r="7" fill="none" stroke="#B5BCC7" stroke-width="2"></circle>';
  return svg;
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const button = (label, onclick, { kind = "", iconName, iconAfter, sub, disabled, ariaLabel } = {}) =>
  h(
    "button",
    { type: "button", class: `btn ${kind}`.trim(), onclick, disabled, "aria-label": ariaLabel },
    iconName && icon(iconName),
    label,
    sub && h("span", { class: "sub" }, sub),
    iconAfter && icon(iconAfter),
  );

const pretty = (s) => s.replace(/(^|[\s(=])-(\d)/g, "$1−$2"); // nicer minus signs in UI text

// ---------- state ----------

const state = {
  lesson: LESSONS[0],
  mode: "learn",
  ai: false,
  demoStep: 0,
  demoBusy: false,
  index: 0,
  indexByLesson: {},
  hintsUsed: 0,
  hints: [],
  stepReached: 0,
  shownSteps: 0,
  stepsShown: 0,
  complete: false,
  solvedMessage: "",
  busy: false,
  solved: new Set(),
  requestId: 0,
  speech: "",
};

const AUTO_SPEAK_KEY = "mathstutor.autoSpeak";
let autoSpeak = false;
try {
  autoSpeak = localStorage.getItem(AUTO_SPEAK_KEY) === "1";
} catch {}

const board = new Board($("board"), {
  onInk: () => {
    updateToolButtons();
    scheduleSave();
  },
});
window.mathsTutorBoard = board; // handy for debugging in the console

const lesson = () => state.lesson;
const problem = () => lesson().practice[state.index];

// ---------- tutor card ----------

function setTutor({ tone = "info", status = "", speech = "", body = [] }) {
  const avatar = $("tutorAvatar");
  avatar.dataset.tone = tone;
  avatar.replaceChildren(icon(tone === "good" ? "check" : tone === "fix" ? "bulb" : "pen", 22, "currentColor", tone === "good" ? 2.4 : 1.8));
  $("tutorStatus").textContent = status;
  $("tutorBody").replaceChildren(...body.flat().filter(Boolean));
  $("tutorCard").scrollTop = 0;
  state.speech = speech;
  if (autoSpeak && speech) speak(speech);
  scheduleSave();
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/x²/g, "x squared").replace(/−/g, "minus "));
  utterance.lang = "en-GB";
  utterance.rate = 0.95;
  const btn = $("speakBtn");
  utterance.onstart = () => btn.classList.add("speaking");
  utterance.onend = utterance.onerror = () => btn.classList.remove("speaking");
  window.speechSynthesis.speak(utterance);
}

function callout(label, text, kind = "") {
  return h("div", { class: `callout ${kind}`.trim() }, h("span", { class: "callout-label" }, label), h("span", { class: "callout-text" }, text));
}

function checklist() {
  return h(
    "ul",
    { class: "checklist", "aria-label": "Steps from the demo" },
    h("li", { class: "checklist-title" }, "Steps from the demo"),
    lesson().methodSteps.map((label, i) => {
      const done = i < state.stepReached;
      const now = i === state.stepReached;
      return h(
        "li",
        { class: `check-item ${done ? "done" : now ? "now" : "todo"}` },
        done ? icon("check", 20, INK.good, 2.4) : circleIcon(now ? "now" : "todo"),
        h("span", {}, label),
        now && h("span", { class: "now-tag" }, "next"),
      );
    }),
  );
}

// ---------- dock ----------

function setDock(children) {
  $("dock").replaceChildren(...children.filter(Boolean));
}

function dots(count, isOn, isCurrent = () => false, label) {
  return h(
    "div",
    { class: "dots", role: "img", "aria-label": label },
    Array.from({ length: count }, (_, i) => h("span", { class: `dot ${isOn(i)} ${isCurrent(i) ? "current" : ""}` })),
  );
}

// ---------- Learn mode ----------

// restore: { demoStep, strokes } when picking up where a saved session left off.
async function enterLearn(restore = null) {
  state.mode = "learn";
  state.demoStep = 0;
  state.demoBusy = false;
  state.requestId += 1;
  syncTabs();
  board.finishAnimations();
  board.clearInk({ record: false });
  board.removeItems(() => true);
  board.resetView();
  board.setColor(INK.student);
  selectColor(INK.student);
  renderLessonPicker();
  if (restore) {
    board.addItem(lesson().demo.title, { animate: false });
    for (let step = 1; step <= restore.demoStep; step++) writeDemoStep(step, false);
    state.demoStep = restore.demoStep;
    markActiveBadge();
    board.importState({ strokes: restore.strokes });
    renderLearn();
    return;
  }
  renderLearn();
  await board.addItem(lesson().demo.title);
}

function writeDemoStep(step, animate = true) {
  const { items } = lesson().demo.steps[step - 1];
  return lesson().demo.autoLayout
    ? writeBelow(items, { label: String(step), gap: 14, tag: { demoStep: step }, animate })
    : items.map((item) => board.addItem({ ...item, demoStep: step }, { animate }));
}

function renderLearn() {
  const step = state.demoStep;
  const steps = lesson().demo.steps;
  const info = step === 0 ? lesson().demo.intro : steps[step - 1];
  $("progressLabel").textContent = step === 0 ? "Demo" : `Step ${step} of ${steps.length}`;
  setTutor({
    status: step === 0 ? "Demo · watch the method" : `Demo · step ${step} of ${steps.length}`,
    speech: `${info.title}. ${info.narration}`,
    body: [
      h("h2", {}, info.title),
      h("p", {}, info.narration),
      callout("Key idea", info.keyIdea),
      step === steps.length &&
        h("p", {}, "That's the whole method. Now it's your turn — I'll watch your working and help if you get stuck."),
    ],
  });
  const atEnd = step === steps.length;
  setDock([
    button("Back", demoBack, { iconName: "left", disabled: step === 0 || state.demoBusy }),
    dots(steps.length, (i) => (i < step ? "on" : ""), () => false, `Step ${step} of ${steps.length}`),
    atEnd
      ? button("Try one yourself", () => enterPractice(state.index), { kind: "primary", iconAfter: "arrow" })
      : button(step === 0 ? "Start" : "Next step", demoNext, { kind: "primary", iconAfter: "right", disabled: state.demoBusy }),
    h(
      "button",
      { type: "button", class: "icon-btn bordered", "aria-label": "Replay the demo from the start", onclick: enterLearn },
      icon("replay", 20, "currentColor", 1.8),
    ),
    !atEnd && h("div", { class: "dock-divider" }),
    !atEnd && button("Skip to practice", () => enterPractice(state.index), { kind: "soft", iconAfter: "arrow" }),
  ]);
}

function markActiveBadge() {
  for (const item of board.items) if (item.kind === "badge") item.active = Number(item.label) === state.demoStep;
  board.requestRender();
}

async function demoNext() {
  const steps = lesson().demo.steps;
  if (state.demoBusy || state.demoStep >= steps.length) return;
  state.demoStep += 1;
  state.demoBusy = true;
  const step = state.demoStep;
  renderLearn();
  const writes = writeDemoStep(step);
  markActiveBadge();
  await Promise.all(writes);
  if (state.mode !== "learn" || state.demoStep !== step) return;
  state.demoBusy = false;
  renderLearn();
}

function demoBack() {
  if (state.demoStep === 0) return;
  board.finishAnimations();
  board.removeItems((item) => item.demoStep === state.demoStep);
  state.demoStep -= 1;
  state.demoBusy = false;
  markActiveBadge();
  renderLearn();
  scheduleSave();
}

// ---------- Try it mode ----------

// restore: a saved question state plus its board, when resuming after a reload.
async function enterPractice(index, restore = null) {
  state.mode = "practice";
  state.index = index;
  state.indexByLesson[lesson().id] = index;
  state.hintsUsed = restore?.hintsUsed ?? 0;
  state.hints = restore?.hints ?? [];
  state.stepReached = restore?.stepReached ?? 0;
  state.shownSteps = restore?.shownSteps ?? 0;
  state.stepsShown = restore?.stepsShown ?? 0;
  state.complete = false;
  state.solvedMessage = "";
  state.busy = false;
  state.requestId += 1;
  syncTabs();
  board.finishAnimations();
  board.clearInk({ record: false });
  board.removeItems(() => true);
  board.resetView();
  board.setTool("pen");
  selectTool("pen");
  board.setColor(INK.student);
  selectColor(INK.student);
  renderLessonPicker();
  if (restore) {
    board.importState(restore.board);
    if (!restore.board.items.length) board.addItem(lesson().practiceTitle(problem()), { animate: false });
    if (restore.complete) return showSolved(restore.solvedMessage);
    showIntro();
    renderPracticeDock();
    return;
  }
  showIntro();
  renderPracticeDock();
  await board.addItem(lesson().practiceTitle(problem()));
}

function practiceStatus() {
  return `Question ${state.index + 1} of ${lesson().practice.length}`;
}

function showIntro(lead) {
  $("progressLabel").textContent = practiceStatus();
  const first = state.stepReached === 0 && !lead;
  setTutor({
    status: state.ai ? "Ready when you are" : "Practice",
    speech: lead ?? "Have a go! Use the same five steps as the demo.",
    body: [
      first && h("h2", {}, "Have a go!"),
      h(
        "p",
        {},
        lead ?? lesson().practiceIntro,
      ),
      !state.ai &&
        first &&
        callout("Heads up", "Handwriting checking isn't switched on, so when you check I'll ask you to type your final answers."),
      checklist(),
    ],
  });
}

function renderPracticeDock() {
  if (state.complete) return renderSolvedDock();
  const hintsLeft = 3 - state.hintsUsed;
  setDock([
    button("Hint", requestHint, {
      iconName: "bulb",
      sub: hintsLeft > 0 ? `${hintsLeft} left` : "none left",
      disabled: state.busy || hintsLeft <= 0,
    }),
    button("Check my work", checkWork, { kind: "primary", iconName: "check", disabled: state.busy }),
    button("Show next step", showNextStep, { kind: "ghost", disabled: state.busy || state.shownSteps >= 5 }),
  ]);
}

function setBusy(busy) {
  state.busy = busy;
  renderPracticeDock();
}

function thinking(text) {
  setTutor({ status: practiceStatus(), body: [h("div", { class: "thinking" }, h("span", { class: "spinner" }), text)] });
}

async function askClaude(mode) {
  const rows = board.rows();
  const exported = board.exportInk(rows);
  const id = ++state.requestId;
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problemId: problem().id,
      mode,
      image: exported.dataUrl,
      rowCount: rows.length,
      hintLevel: state.hintsUsed,
      previousHints: state.hints,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (id !== state.requestId) return null; // user moved on
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? "Something went wrong.");
    error.code = data?.error?.code;
    throw error;
  }
  return { feedback: data.feedback, rows };
}

async function checkWork() {
  if (state.busy) return;
  if (!board.hasInk) {
    showIntro("Write your working on the board first — start with the equation and read off a, b and c. Then press Check my work.");
    return;
  }
  if (!state.ai) return showTypedAnswer();
  setBusy(true);
  thinking("Reading your working…");
  try {
    const result = await askClaude("check");
    if (!result) return;
    await showFeedback(result.feedback, result.rows);
  } catch (error) {
    showError(error);
  } finally {
    if (state.mode === "practice") setBusy(false);
  }
}

// Pre-written hint for this level, skipping ahead past steps the student already has.
function scriptedHint(level) {
  const progress = Math.max(state.stepReached, state.shownSteps);
  const index = Math.min(2, Math.max(level - 1, progress >= 3 ? 2 : progress >= 2 ? 1 : 0));
  return lesson().hints(problem())[index];
}

async function requestHint() {
  if (state.busy || state.hintsUsed >= 3) return;
  state.hintsUsed += 1;
  const level = state.hintsUsed;
  if (state.ai && board.hasInk) {
    setBusy(true);
    thinking("Looking at where you are…");
    try {
      const result = await askClaude("hint");
      if (!result) return;
      const { feedback, rows } = result;
      state.hints.push(feedback.message);
      state.stepReached = Math.max(state.stepReached, feedback.stepReached);
      if (feedback.annotations.length) await drawAnnotations(feedback, rows);
      showHint(level, feedback.message, feedback.question, feedback.headline);
    } catch (error) {
      showHint(level, scriptedHint(level));
    } finally {
      if (state.mode === "practice") setBusy(false);
    }
  } else {
    const hint = scriptedHint(level);
    state.hints.push(hint);
    showHint(level, hint);
    renderPracticeDock();
  }
}

function showHint(level, text, question = "", headline = "") {
  setTutor({
    tone: "fix",
    status: `Hint ${level} of 3`,
    speech: `${pretty(text)} ${question}`,
    body: [
      headline && h("h2", {}, headline),
      h("p", {}, pretty(text)),
      question && h("p", { class: "question" }, pretty(question)),
      h(
        "div",
        { class: "row-buttons" },
        button("Got it", () => showIntro(), { kind: "primary" }),
        level < 3 && button("Another hint", requestHint),
      ),
    ],
  });
}

async function showFeedback(feedback, rows) {
  state.stepReached = Math.max(state.stepReached, feedback.stepReached);
  await drawAnnotations(feedback, rows);
  if (feedback.verdict === "complete") return showSolved(feedback.message);

  const tone = feedback.verdict === "mistake" ? "fix" : "info";
  const body = [
    h("h2", {}, feedback.headline),
    feedback.message && h("p", {}, pretty(feedback.message)),
    feedback.question && h("p", { class: "question" }, pretty(feedback.question)),
  ];
  if (feedback.verdict === "mistake")
    body.push(callout("Tip", lesson().mistakeTip, "fix"));
  body.push(
    h(
      "div",
      { class: "row-buttons" },
      button(feedback.verdict === "mistake" ? "Let me fix it" : "Keep going", () => showIntro(), { kind: "primary" }),
      state.hintsUsed < 3 && button("Hint", requestHint),
    ),
  );
  if (feedback.verdict !== "mistake") body.push(checklist());
  setTutor({
    tone,
    status: feedback.verdict === "mistake" ? "Spotted something" : feedback.verdict === "unclear" ? "Hmm" : "Looking good",
    speech: `${feedback.headline}. ${pretty(feedback.message)} ${pretty(feedback.question)}`,
    body,
  });
}

function rootsText() {
  return lesson()
    .answers(problem())
    .map((r) => `x = ${r}`)
    .join(" or ");
}

function showSolved(message) {
  state.solved.add(problem().id);
  state.solvedMessage = message ?? "";
  state.stepReached = 5;
  const last = state.index === lesson().practice.length - 1;
  const nextLesson = LESSONS[LESSONS.indexOf(lesson()) + 1];
  state.complete = true;
  const helped = state.hintsUsed + state.stepsShown;
  setTutor({
    tone: "good",
    status: `Question ${state.index + 1} complete`,
    speech: `You solved it! ${pretty(rootsText())}. ${message ?? ""}`,
    body: [
      h("h2", { class: "big" }, `You solved it: ${pretty(rootsText())}`),
      message && h("p", {}, pretty(message)),
      h(
        "div",
        { class: "callout neutral" },
        h("span", { class: "callout-label" }, "What you used"),
        lesson().recap.map((t) =>
          h("div", { class: "recap-row" }, icon("check", 18, INK.good, 2.4), t),
        ),
        h(
          "div",
          { class: "recap-row muted" },
          icon("bulb", 18, "#B23C0B", 1.8),
          helped === 0 ? "No hints needed" : helpSummary(),
        ),
      ),
      last && h("p", {}, "That's the whole practice set done. Brilliant work!"),
      !last && button("Next question", () => enterPractice(state.index + 1), { kind: "primary big", iconAfter: "arrow" }),
      last &&
        nextLesson &&
        button(`Next lesson: ${nextLesson.title}`, () => switchLesson(nextLesson), { kind: "primary big", iconAfter: "arrow" }),
      h(
        "div",
        { class: "row-buttons" },
        last && button("Start the set again", () => enterPractice(0), { kind: nextLesson ? "" : "primary" }),
        button("Replay the demo", enterLearn),
      ),
    ],
  });
  renderSolvedDock();
  renderLessonPicker();
  $("progressLabel").textContent = practiceStatus();
}

function helpSummary() {
  const parts = [];
  if (state.hintsUsed) parts.push(`${state.hintsUsed} hint${state.hintsUsed === 1 ? "" : "s"} used`);
  if (state.stepsShown) parts.push(`${state.stepsShown} step${state.stepsShown === 1 ? "" : "s"} shown`);
  return parts.join(", ");
}

function solvedCount(l = lesson()) {
  return l.practice.filter((p) => state.solved.has(p.id)).length;
}

function renderSolvedDock() {
  setDock([
    h("span", { class: "dock-label" }, "Practice set"),
    dots(
      lesson().practice.length,
      (i) => (state.solved.has(lesson().practice[i].id) ? "done" : ""),
      (i) => i === state.index,
      `${solvedCount()} of ${lesson().practice.length} solved`,
    ),
    h("span", { class: "progress-label" }, `${solvedCount()} of ${lesson().practice.length} done`),
  ]);
}

function showError(error) {
  const offline = error.code === "ai_off";
  if (offline) state.ai = false;
  setTutor({
    tone: "fix",
    status: "Couldn't check",
    speech: error.message,
    body: [
      h("h2", {}, "I couldn't read your board just now"),
      h("p", {}, error.message || "Something went wrong."),
      h(
        "div",
        { class: "row-buttons" },
        !offline && button("Try again", checkWork, { kind: "primary" }),
        button("Type my answer instead", showTypedAnswer, { kind: offline ? "primary" : "" }),
      ),
    ],
  });
}

function showTypedAnswer(note) {
  const first = h("input", { id: "ans1", inputmode: "decimal", autocomplete: "off", "aria-label": "First solution" });
  const second = h("input", { id: "ans2", inputmode: "decimal", autocomplete: "off", "aria-label": "Second solution" });
  const submit = (e) => {
    e.preventDefault();
    const result = lesson().checkAnswer(problem(), [first.value, second.value]);
    if (result.correct) {
      state.stepReached = 5;
      return showSolved("You found both solutions.");
    }
    showTypedAnswer(
      result.reason === "missing"
        ? "Quadratics usually have two answers — fill in both."
        : result.reason === "not-a-number"
          ? "Type just the number for each answer, like -3."
          : lesson().answerDp
            ? `Not quite. Check your signs and that you divided the whole top line by 2a, then round to ${lesson().answerDp} decimal places.`
            : "Not quite. Substitute your answers back into the equation to check them, or ask for a hint.",
    );
  };
  setTutor({
    tone: note ? "fix" : "info",
    status: practiceStatus(),
    speech: note ?? "Type your two solutions.",
    body: [
      h("h2", {}, "Type your answers"),
      h("p", {}, note ?? `What values of x did you get? Type each solution.${lesson().answerNote ? ` ${lesson().answerNote}` : ""}`),
      h(
        "form",
        { class: "answer-form", onsubmit: submit },
        h("div", { class: "answer-inputs" }, h("label", {}, "x =", first), h("span", {}, "or"), h("label", {}, "x =", second)),
        h("div", { class: "row-buttons" }, button("Check", null, { kind: "primary" }), button("Back", () => showIntro())),
      ),
    ],
  });
  $("tutorBody").querySelector("form .btn.primary").type = "submit";
  first.focus();
}

async function showNextStep() {
  if (state.busy) return;
  const index = Math.max(state.stepReached, state.shownSteps);
  if (index >= 5) return;
  state.shownSteps = index + 1;
  state.stepsShown += 1;
  renderPracticeDock();
  const step = lesson().solutionSteps(problem())[index];
  const label = lesson().methodSteps[index];
  setTutor({
    status: `Step ${index + 1} of 5 shown`,
    speech: `Step ${index + 1}: ${label}. ${pretty(step.text)}`,
    body: [
      h("h2", {}, `Step ${index + 1}: ${label}`),
      h(
        "p",
        {},
        index === 4
          ? "That's the full solution. Read it through, then try the next question on your own."
          : "I've written this step on the board in blue. Copy it down underneath, then try the next step yourself.",
      ),
      checklist(),
    ],
  });
  await Promise.all(writeBelow(step.items, { label: String(index + 1), gap: 24 }));
  if (index === 4) {
    state.stepReached = 5;
    renderPracticeDock();
  }
}

// Writes tutor items one under another, below everything already on the board,
// with a numbered badge beside the first. Returns the write promises.
function writeBelow(items, { label, gap = 20, tag = {}, animate = true }) {
  let y = Math.max(130, board.contentBottom() + gap);
  const writes = [];
  items.forEach((item, i) => {
    const placed = { ...item, x: item.x ?? LEFT, y: item.y ?? y, ...tag };
    if (i === 0 && label) {
      const bounds = board.itemBounds(placed);
      writes.push(board.addItem({ kind: "badge", x: 108, y: (bounds.top + bounds.bottom) / 2, label, ...tag }, { animate }));
    }
    writes.push(board.addItem(placed, { animate }));
    y = board.itemBounds(placed).bottom + gap;
  });
  return writes;
}

// ---------- lessons ----------

function switchLesson(next) {
  state.indexByLesson[lesson().id] = state.index;
  state.lesson = next;
  state.index = state.indexByLesson[next.id] ?? 0;
  closeLessonMenu();
  enterLearn();
}

function renderLessonPicker() {
  $("lessonTitle").textContent = lesson().title;
  const menu = $("lessonMenu");
  menu.replaceChildren(
    ...LESSONS.map((l, i) => {
      const done = solvedCount(l);
      return h(
        "button",
        {
          type: "button",
          class: "lesson-option",
          role: "menuitem",
          "aria-current": l === lesson() ? "true" : null,
          onclick: () => (l === lesson() ? closeLessonMenu() : switchLesson(l)),
        },
        h("span", { class: "lesson-num" }, String(i + 1)),
        h("span", { class: "lesson-name" }, l.title),
        h("span", { class: "lesson-progress" }, done ? `${done}/${l.practice.length} solved` : ""),
      );
    }),
  );
}

function closeLessonMenu() {
  $("lessonMenu").hidden = true;
  $("lessonBtn").setAttribute("aria-expanded", "false");
}

$("lessonBtn").addEventListener("click", () => {
  const open = $("lessonMenu").hidden;
  renderLessonPicker();
  $("lessonMenu").hidden = !open;
  $("lessonBtn").setAttribute("aria-expanded", String(open));
});
document.addEventListener("pointerdown", (e) => {
  if (!$("lessonMenu").hidden && !e.target.closest(".lesson-picker")) closeLessonMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("lessonMenu").hidden) {
    closeLessonMenu();
    $("lessonBtn").focus();
  }
});

// Draws Claude's marks beside the rows it refers to.
async function drawAnnotations(feedback, rows) {
  board.clearLayer("annotation");
  const card = $("tutorCard").getBoundingClientRect();
  const narrow = window.innerWidth <= 760;
  const limit = board.visibleRight(narrow ? 0 : card.width + 32);
  for (const note of feedback.annotations) {
    const row = rows[note.row - 1];
    if (!row) continue;
    const color = note.tone === "good" ? INK.good : note.tone === "fix" ? INK.fix : INK.tutor;
    const midY = (row.top + row.bottom) / 2;
    const h0 = Math.max(row.bottom - row.top, 20);
    const layer = { layer: "annotation" };
    let textX = row.right + 28;
    if (note.mark === "tick" || note.mark === "cross") {
      await board.addItem({ kind: "mark", type: note.mark, x: row.right + 34, y: midY, size: 28, color }, layer);
      textX = row.right + 66;
    } else if (note.mark === "circle") {
      await board.addItem(
        { kind: "ellipse", cx: (row.left + row.right) / 2, cy: midY, rx: (row.right - row.left) / 2 + 18, ry: h0 / 2 + 12, color },
        layer,
      );
      textX = row.right + 40;
    } else if (note.mark === "underline") {
      await board.addItem({ kind: "wavy", x: row.left, y: row.bottom + 8, w: row.right - row.left, color }, layer);
    }
    if (!note.note) continue;
    const size = 26;
    const item = { kind: "line", x: textX, y: midY - size * 0.6, size, color, segments: [{ text: note.note }] };
    const width = board.layoutLine(item).width;
    if (textX + width > limit) {
      // No room on the right: write the note underneath the row instead.
      item.x = row.left;
      item.y = row.bottom + (note.mark === "underline" ? 16 : 6);
    }
    await board.addItem(item, layer);
  }
  scheduleSave();
}

// ---------- toolbar, tabs, settings ----------

function selectTool(tool) {
  for (const btn of document.querySelectorAll(".tool[data-tool]")) btn.setAttribute("aria-pressed", String(btn.dataset.tool === tool));
}

function selectColor(color) {
  for (const btn of document.querySelectorAll(".swatch")) btn.setAttribute("aria-pressed", String(btn.dataset.color === color));
}

function updateToolButtons() {
  $("undoBtn").disabled = board.undoStack.length === 0;
  $("redoBtn").disabled = board.redoStack.length === 0;
  $("clearBtn").disabled = !board.hasInk;
}

function setTool(tool) {
  board.setTool(tool);
  selectTool(tool);
}

function syncTabs() {
  $("tabLearn").setAttribute("aria-pressed", String(state.mode === "learn"));
  $("tabPractice").setAttribute("aria-pressed", String(state.mode === "practice"));
}

for (const btn of document.querySelectorAll(".tool[data-tool]")) btn.addEventListener("click", () => setTool(btn.dataset.tool));
for (const btn of document.querySelectorAll(".swatch")) {
  btn.style.setProperty("--c", btn.dataset.color);
  btn.addEventListener("click", () => {
    board.setColor(btn.dataset.color);
    selectColor(btn.dataset.color);
    if (board.tool === "eraser" || board.tool === "hand") setTool("pen");
  });
}
$("undoBtn").addEventListener("click", () => board.undo());
$("redoBtn").addEventListener("click", () => board.redo());
$("clearBtn").addEventListener("click", () => {
  if (board.hasInk && window.confirm("Clear everything you've written? (You can undo this.)")) {
    board.clearInk();
    board.clearLayer("annotation");
  }
});
$("tabLearn").addEventListener("click", () => state.mode !== "learn" && enterLearn());
$("tabPractice").addEventListener("click", () => state.mode !== "practice" && enterPractice(state.index));
$("speakBtn").addEventListener("click", () => {
  if (window.speechSynthesis?.speaking) {
    window.speechSynthesis.cancel();
    return;
  }
  speak(state.speech);
});

const settingsBtn = $("settingsBtn");
const settingsPanel = $("settingsPanel");
settingsBtn.addEventListener("click", () => {
  const open = settingsPanel.hidden;
  settingsPanel.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", String(open));
});
document.addEventListener("pointerdown", (e) => {
  if (!settingsPanel.hidden && !e.target.closest(".settings")) {
    settingsPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  }
});
$("autoSpeak").checked = autoSpeak;
$("autoSpeak").addEventListener("change", (e) => {
  autoSpeak = e.target.checked;
  try {
    localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? "1" : "0");
  } catch {}
  if (!autoSpeak) window.speechSynthesis?.cancel();
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select")) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    if (e.shiftKey) board.redo();
    else board.undo();
  } else if ((e.ctrlKey || e.metaKey) && key === "y") {
    e.preventDefault();
    board.redo();
  } else if (e.key === " " && !e.repeat && !e.target.closest("button")) {
    e.preventDefault();
    board.spaceDown = true;
    board.canvas.dataset.tool = "hand";
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (key === "p") setTool("pen");
    else if (key === "h") setTool("highlighter");
    else if (key === "e") setTool("eraser");
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    board.spaceDown = false;
    board.canvas.dataset.tool = board.tool;
  }
});

async function loadStatus() {
  const status = $("aiStatus");
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    state.ai = Boolean(data.ai);
  } catch {
    state.ai = false;
  }
  status.textContent = state.ai
    ? "Handwriting checking is on — Claude reads your working when you press Check my work."
    : "Handwriting checking is off on this server (no API key). You can still do the demo, get hints and type your answers.";
  status.classList.toggle("on", state.ai);
  if (state.mode === "practice" && !state.busy && !state.complete) showIntro();
}

// ---------- saving progress ----------

let saveTimer = null;
let resetting = false;

function snapshot() {
  const practice = state.mode === "practice";
  return {
    lessonId: lesson().id,
    mode: state.mode,
    demoStep: practice ? 0 : state.demoStep,
    indexByLesson: { ...state.indexByLesson, [lesson().id]: state.index },
    solved: [...state.solved],
    question: practice
      ? {
          problemId: problem().id,
          hintsUsed: state.hintsUsed,
          hints: state.hints,
          stepReached: state.stepReached,
          shownSteps: state.shownSteps,
          stepsShown: state.stepsShown,
          complete: state.complete,
          solvedMessage: state.solvedMessage,
        }
      : null,
    board: board.exportState({ items: practice }),
  };
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!resetting) saveProgress(snapshot());
}

function scheduleSave() {
  if (resetting) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

// Save straight away when the tab is hidden or closed, so nothing written is lost.
window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveNow());

function resume() {
  const saved = loadProgress(LESSONS);
  if (!saved) return enterLearn();
  state.lesson = LESSONS.find((l) => l.id === saved.lessonId);
  state.solved = new Set(saved.solved);
  state.indexByLesson = saved.indexByLesson;
  state.index = saved.indexByLesson[saved.lessonId] ?? 0;
  if (saved.mode === "practice")
    return enterPractice(state.index, saved.question && { ...saved.question, board: saved.board });
  return enterLearn({ demoStep: saved.demoStep, strokes: saved.board.strokes });
}

$("resetProgress").addEventListener("click", () => {
  if (!window.confirm("Start again from scratch? This clears your solved questions and anything on the board.")) return;
  resetting = true;
  clearTimeout(saveTimer);
  clearProgress();
  window.location.reload();
});

// ---------- start ----------

updateToolButtons();
setTool("pen");
loadStatus();
resume();
