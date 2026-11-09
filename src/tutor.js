// Asks Claude to read a student's handwritten working and respond like a tutor.
// The browser sends an image of the student's ink with each line labelled R1, R2, …
// Claude replies with structured JSON: what it read, a verdict, a short message,
// and annotations tied to row numbers that the board draws next to the working.

import Anthropic from "@anthropic-ai/sdk";
import { METHOD_STEPS, equationText, factorPair, roots, solutionLines } from "../public/js/lesson.js";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "low";

const VERDICTS = ["complete", "on_track", "mistake", "unclear"];
const MARKS = ["tick", "cross", "circle", "underline", "none"];
const TONES = ["good", "fix", "info"];

export const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["transcription", "verdict", "step_reached", "mistake_row", "headline", "message", "question", "annotations"],
  properties: {
    transcription: {
      type: "array",
      description: "What you read on each labelled row, in plain-text maths.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "text"],
        properties: { row: { type: "integer" }, text: { type: "string" } },
      },
    },
    verdict: {
      type: "string",
      enum: VERDICTS,
      description:
        "complete = correct answers reached with sound working; on_track = correct so far but unfinished; mistake = there is an error; unclear = nothing relevant written or unreadable.",
    },
    step_reached: {
      type: "integer",
      description: "How many of the five method steps (0–5) the student has completed correctly.",
    },
    mistake_row: { type: "integer", description: "Row number of the first mistake, or 0 if there is none." },
    headline: { type: "string", description: "2–5 words for the top of the tutor card, e.g. 'So close!'." },
    message: { type: "string", description: "1–3 short sentences of feedback or hint, addressed to the student." },
    question: { type: "string", description: "One short question that nudges them on, or an empty string." },
    annotations: {
      type: "array",
      description: "Marks the tutor draws on the board, at most one per row and at most 4 in total.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "mark", "note", "tone"],
        properties: {
          row: { type: "integer" },
          mark: { type: "string", enum: MARKS },
          note: { type: "string", description: "Handwritten note beside the row, under 40 characters, or empty." },
          tone: { type: "string", enum: TONES },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are a patient, encouraging maths tutor working at a whiteboard with a secondary-school student (roughly age 13–16, UK). The student is learning to solve quadratic equations by factorising and is writing their working by hand.

You will see an image of the student's handwriting. The app has labelled each line of working R1, R2, … in grey in the left margin; the student did not write those labels. Use the row numbers to refer to lines.

How to respond:
- Read the working carefully and transcribe each row. If a character is ambiguous, pick the most likely reading given the maths, and be cautious before calling it a mistake. If a row is unreadable, say so kindly instead of guessing.
- Judge the maths, not neatness or notation. Accept equivalent forms: brackets in either order, answers in any order, ×, * or no sign for multiplication, "x=4, x=-3" or "x = 4 or -3".
- Students may skip or merge steps; that's fine if the maths is right. Don't demand the exact layout of the method.
- If there is a mistake, point at the first one only. Say what is right before what is wrong, and help them see the problem themselves (for example by asking them to check a sum or a sign) rather than correcting it for them.
- Never reveal the factor pair or the final answers unless the student has already written them correctly, or the request is a level-3 hint.
- Keep it short and warm. Plain words, short sentences, UK English. Celebrate genuine progress without gushing.
- Board notes sit next to a row in handwriting, so keep each under 40 characters, plain-text maths only (x², -3 × 4), no LaTeX. Use tone "good" for ticks and praise, "fix" for something to correct, "info" for neutral pointers.`;

const HINT_GUIDE = {
  1: "Level 1: a gentle nudge — a question about what to think about or check next.",
  2: "Level 2: a more specific pointer — which rule to use, or which numbers or sign to look at.",
  3: "Level 3: show them the next step explicitly (you may now reveal the factor pair), then let them finish.",
};

export function buildRequestText({ problem, mode, hintLevel, rowCount, previousHints = [] }) {
  const pair = factorPair(problem.b, problem.c);
  const lines = [
    `The equation: ${equationText(problem)}`,
    `For your reference only (don't reveal unless allowed): factor pair ${pair.p} and ${pair.q}; solutions x = ${roots(problem).join(" and x = ")}.`,
    `A model solution, one line per method step:`,
    ...solutionLines(problem).map((line, i) => `  ${i + 1}. ${METHOD_STEPS[i]}: ${line}`),
    "",
    rowCount > 0
      ? `The image shows ${rowCount} labelled row${rowCount === 1 ? "" : "s"} of the student's working (R1–R${rowCount}).`
      : "The student hasn't written anything yet.",
  ];
  if (mode === "hint") {
    lines.push(
      "",
      `The student pressed "Hint" and wants help with what to do next. ${HINT_GUIDE[hintLevel] ?? HINT_GUIDE[1]}`,
      "Base the hint on where they are in their working. If they have made a mistake, the hint should help them find it.",
    );
    if (previousHints.length) lines.push(`Hints already given (don't repeat them): ${previousHints.map((h) => `"${h}"`).join("; ")}`);
  } else {
    lines.push("", 'The student pressed "Check my work". Give feedback on their working so far.');
  }
  return lines.join("\n");
}

const clampInt = (value, min, max, fallback) =>
  Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Defensive clean-up of Claude's JSON so the board never draws out-of-range rows.
export function sanitizeFeedback(raw, rowCount) {
  if (!raw || typeof raw !== "object") throw new TutorError("bad_output", "The tutor's reply couldn't be understood.");
  const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : "unclear";
  const validRow = (row) => Number.isInteger(row) && row >= 1 && row <= rowCount;
  const seenRows = new Set();
  const annotations = (Array.isArray(raw.annotations) ? raw.annotations : [])
    .filter((a) => a && validRow(a.row) && !seenRows.has(a.row) && seenRows.add(a.row))
    .slice(0, 4)
    .map((a) => ({
      row: a.row,
      mark: MARKS.includes(a.mark) ? a.mark : "none",
      note: text(a.note, 48),
      tone: TONES.includes(a.tone) ? a.tone : "info",
    }));
  return {
    transcription: (Array.isArray(raw.transcription) ? raw.transcription : [])
      .filter((t) => t && validRow(t.row))
      .map((t) => ({ row: t.row, text: text(t.text, 200) })),
    verdict,
    stepReached: clampInt(raw.step_reached, 0, 5, 0),
    mistakeRow: validRow(raw.mistake_row) ? raw.mistake_row : 0,
    headline: text(raw.headline, 60) || (verdict === "complete" ? "You solved it!" : "Let's take a look"),
    message: text(raw.message, 600),
    question: text(raw.question, 200),
    annotations,
  };
}

export class TutorError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function describeApiError(error) {
  if (error instanceof Anthropic.AuthenticationError)
    return new TutorError("auth", "The Claude API key was rejected. Check ANTHROPIC_API_KEY on the server.", 502);
  if (error instanceof Anthropic.PermissionDeniedError)
    return new TutorError("permission", "This API key can't use the configured model.", 502);
  if (error instanceof Anthropic.RateLimitError)
    return new TutorError("rate_limited", "The tutor is busy right now. Try again in a moment.", 429);
  if (error instanceof Anthropic.BadRequestError)
    return new TutorError("bad_request", `Claude rejected the request: ${error.message}`, 502);
  if (error instanceof Anthropic.APIConnectionError)
    return new TutorError("network", "Couldn't reach Claude. Check the server's internet connection.", 502);
  if (error instanceof Anthropic.APIError) return new TutorError("api_error", `Claude API error (${error.status}).`, 502);
  return error;
}

// client: an Anthropic instance (or a test double exposing beta.messages.create).
export function createTutor({ client, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT }) {
  return {
    model,
    async feedback({ problem, image, rowCount, mode = "check", hintLevel = 1, previousHints = [] }) {
      const base64 = image.replace(/^data:image\/png;base64,/, "");
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          // If a safety classifier declines, let the API retry on its recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort, format: { type: "json_schema", schema: FEEDBACK_SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
                { type: "text", text: buildRequestText({ problem, mode, hintLevel, rowCount, previousHints }) },
              ],
            },
          ],
        });
      } catch (error) {
        throw describeApiError(error);
      }
      if (response.stop_reason === "refusal")
        throw new TutorError("refusal", "The tutor couldn't respond to that. Try rewriting your working.");
      if (response.stop_reason === "max_tokens")
        throw new TutorError("bad_output", "The tutor's reply was cut short. Please try again.");
      const json = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new TutorError("bad_output", "The tutor's reply couldn't be understood. Please try again.");
      }
      return sanitizeFeedback(parsed, rowCount);
    },
  };
}
