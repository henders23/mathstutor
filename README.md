# Maths Tutor

A whiteboard-first maths tutor. Each lesson works the same way:

1. **Learn** – the tutor writes a worked example on the board one step at a time, with a short explanation and a "key idea" for each step. You can go back, replay or have it read aloud.
2. **Try it** – you get a question and work it out by hand on the board (stylus, finger or mouse). Press **Check my work** and Claude reads your handwriting, marks it on the board (ticks, underlines, short notes beside the right line) and nudges you towards any mistake without giving the answer away.
3. **Hints and next steps** – up to three hints per question, each more specific than the last, and **Show next step** writes the next line of the solution for you.

### Lessons (Quadratic equations)

| # | Lesson | Demo | Practice |
| --- | --- | --- | --- |
| 1 | Solving by factorising | x² + 5x + 6 = 0 | Five x² + bx + c questions that get gradually trickier with the signs |
| 2 | The quadratic formula | 2x² + 3x − 4 = 0, answers to 2 d.p. | Five questions, mostly with a ≠ 1 and answers to 2 decimal places (calculator allowed) |

Pick a lesson from the menu in the top bar. Finishing a lesson's practice set also offers the next lesson.

## Running it

You need Node.js 22.9 or newer.

```bash
npm install
cp .env.example .env   # then put your Anthropic API key in .env
npm start
```

Open <http://localhost:3000>. To use it from a tablet on the same Wi-Fi, set `HOST=0.0.0.0` in `.env` and open `http://<your-computer's-IP>:3000` on the tablet.

Without an API key everything except handwriting checking still works. In that case **Check my work** asks you to type your final answers, and the hints are pre-written instead of being based on your working.

### Settings (`.env`)

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Turns on handwriting checking. It stays on the server and is never sent to the browser. |
| `TUTOR_MODEL` | `claude-opus-5-5` | The Claude model that reads the board. |
| `TUTOR_EFFORT` | `low` | `low`, `medium` or `high`. Higher is more thorough but slower to reply. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens. |
| `TUTOR_AI` | – | `off` turns handwriting checking off even when a key is set. |

## Typing maths

Students can type as well as write, and mix the two freely on the same board.

- **Starting a line:** pick the **Type** tool (keyboard icon, or press **T**). A maths box opens on the next line under the working. Tap anywhere on the board to start a box there instead.
- **Entering maths:** type normally. Shortcuts turn into proper notation as you go: `x^2` → x², `/` → a stacked fraction, `sqrt` → √, `+-` → ±, `or` → "or".
- **The keypad:** while a box is active, a keypad appears with x², powers, √, fractions, ±, ×, ÷, brackets and "or". It hides again when you're done.
- **Finishing:** **Enter** (or **New line**) commits the line and opens the next one underneath. **Done** or tapping away commits it. **Esc** cancels.
- **Editing:** with the Type tool, tap a typed line to edit it, or drag it to move it. The eraser removes typed lines, and undo/redo and progress saving cover them.

**How checking uses typed lines:**

- **Claude:** typed lines are sent as exact LaTeX, labelled with their row numbers, so they don't depend on handwriting recognition. If the board is all typed, no image is sent at all. In a mixed board, the image shows typed lines as dashed boxes with a plain-text version.
- **Without an API key:** if the student types answers such as `x = 4 or x = -3`, they're checked instantly in the browser.

The maths boxes use [MathLive](https://mathlive.io) (MIT licence). It's served from this server's `node_modules`, so no third-party script is loaded. Rendering typed maths needs inline styles, so the Content-Security-Policy allows `'unsafe-inline'` for styles only; scripts are still restricted to the app itself. Typed LaTeX is checked against a list of allowed maths commands before rendering, and anything else is shown as plain text.

## Saving progress

Progress is saved automatically in the browser (localStorage), so a reload or closing the tab doesn't lose anything. It saves:

- the lesson and screen you were on, and how far through the demo you were
- your question number in each lesson, and which questions you've solved
- the current question's hints and steps used, plus everything written on the board, including the tutor's marks

It saves on every change and straight away when the tab is hidden or closed. Saved data is checked when it's loaded, so a corrupted entry is simply ignored.

Progress belongs to that browser on that device; there are no accounts yet. **Settings → Reset my progress** clears it. Undo history starts fresh after a reload.

## How the checking works

- The board stores your writing as vector strokes. When you press **Check**, the app groups the strokes into lines of working (`public/js/rows.js`). It then draws only your ink onto a clean white image and labels each line R1, R2, … in the margin.
- The server (`src/tutor.js`) sends that image to Claude along with the question, the correct method and the answer, so Claude can grade accurately. Claude is told never to reveal the answer unless you've earned it.
- Claude replies in a fixed JSON format (structured outputs): what it read on each line, a verdict, a short message, and marks that refer to line numbers. The board draws each mark next to the matching line, so the model never has to guess pixel positions.
- If Claude's safety filter declines a request, the API automatically retries on a fallback model (`fallbacks: "default"`).
- The server checks every request before calling Claude, limits each visitor to 20 checks a minute, and sends a strict Content-Security-Policy.

**Privacy note:** pressing Check or Hint (with AI on) sends an image of the student's handwriting to Anthropic's API. Nothing else about the student is sent.

## Whiteboard controls

- **Tools:** pen (P), highlighter (H), eraser (E), move (hold Space and drag), plus four ink colours, undo/redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z) and clear.
- **Pen pressure:** used when drawing with a stylus.
- **Palm rejection:** once a stylus has been used, a finger pans the board instead of drawing.
- **Zoom:** pinch, or Ctrl+scroll.

## Project layout

```
server.js            HTTP server: static files, /api/status, /api/feedback
src/tutor.js         Prompt, JSON schema, Claude call, response clean-up
public/index.html    Page shell
public/styles.css    Styles
public/js/app.js     Lesson flow: demo, practice, hints, feedback on the board
public/js/board.js   The whiteboard: strokes, pan/zoom, animated tutor writing, image export
public/js/rows.js    Groups strokes into lines of working
public/js/progress.js  Saves and validates progress in localStorage
public/js/typing.js  Maths input boxes (MathLive) and the symbol keypad
public/js/mathtext.js  Safe-LaTeX check and reading typed answers
public/js/lessons/   Lesson content (shared by browser, server and tests)
  common.js          Maths and formatting helpers
  factorising.js     Lesson 1
  formula.js         Lesson 2
  index.js           The lesson catalogue, in teaching order
test/                node --test suites
```

## Tests

```bash
npm test
```

The tests cover the lesson maths, line detection, the Claude request and response handling (using a stand-in client), and the server's validation and endpoints.

## Adding lessons

Each lesson is one file in `public/js/lessons/` that exports a lesson object. Add it to `LESSONS` in `index.js`. A lesson provides:

- **Method:** `methodSteps`, the five step names used for the checklist and the tutor's steps.
- **Demo:** `demo` holds an intro, the title and five steps, each with narration, a key idea and board items. Board items can be text lines or fractions; a text segment with `root: true` gets a hand-drawn √ sign. Set `autoLayout: true` to stack the items automatically, or give items an `x`/`y` to place them yourself.
- **Practice questions:** `practice` lists the questions with `a`, `b`, `c` and a unique `id`.
- **Per question:** `solutionSteps(problem)` gives the worked lines, both as board items and as text for Claude. `hints(problem)` gives three escalating hints. `answers(problem)` and `checkAnswer(problem, values)` handle typed-answer mode.
- **For Claude:** `referenceText(problem)` is the answer key. `gradingNotes` says what to accept and what not to give away.
