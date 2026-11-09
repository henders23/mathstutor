import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { FEEDBACK_SCHEMA, buildRequestText, createTutor, sanitizeFeedback, TutorError } from "../src/tutor.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const problem = { id: "p1", lessonId: "factorising", a: 1, b: -1, c: -12 };
const formulaProblem = { id: "f2", lessonId: "formula", a: 2, b: -5, c: 1 };

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    },
  };
}

const good = {
  transcription: [{ row: 1, text: "a=1 b=-1 c=-12" }, { row: 2, text: "(x-3)(x+4)=0" }],
  verdict: "mistake",
  step_reached: 2,
  mistake_row: 2,
  headline: "So close!",
  message: "-3 × 4 = -12, nice. But -3 + 4 = +1 and we need -1.",
  question: "What if you swap the signs?",
  annotations: [
    { row: 1, mark: "tick", note: "", tone: "good" },
    { row: 2, mark: "underline", note: "adds to +1, need -1", tone: "fix" },
  ],
};

test("sends the image, schema and lesson context to Claude", async () => {
  const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(good) }] });
  const tutor = createTutor({ client });
  const feedback = await tutor.feedback({ problem, image: PNG, rowCount: 2, mode: "check" });

  const params = client.calls[0];
  assert.equal(params.model, "claude-opus-5-5");
  assert.deepEqual(params.output_config.format, { type: "json_schema", schema: FEEDBACK_SCHEMA });
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.temperature, undefined);
  const [image, text] = params.messages[0].content;
  assert.deepEqual(image.source, { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" });
  assert.match(text.text, /x² - x - 12 = 0/);
  assert.match(text.text, /R1–R2/);
  assert.match(text.text, /Check my work/);
  assert.match(text.text, /Lesson: Solving by factorising/);
  assert.match(text.text, /Factor pair -4 and 3/);

  assert.equal(feedback.verdict, "mistake");
  assert.equal(feedback.mistakeRow, 2);
  assert.equal(feedback.annotations.length, 2);
});

test("hint requests carry the level and previous hints", () => {
  const text = buildRequestText({ problem, mode: "hint", hintLevel: 2, rowCount: 1, previousHints: ["Read off a, b, c."] });
  assert.match(text, /Level 2/);
  assert.match(text, /Read off a, b, c\./);
});

test("formula questions tell Claude the method, the 2 d.p. answers and what to accept", () => {
  const text = buildRequestText({ problem: formulaProblem, mode: "check", rowCount: 3 });
  assert.match(text, /Lesson: The quadratic formula/);
  assert.match(text, /2x² - 5x \+ 1 = 0 \(Give your answers to 2 decimal places\.\)/);
  assert.match(text, /b² - 4ac = 17/);
  assert.match(text, /x = 2\.28 and x = 0\.22/);
  assert.match(text, /exact form/);
});

test("sanitising drops out-of-range rows, duplicates and unknown enums", () => {
  const result = sanitizeFeedback(
    {
      ...good,
      verdict: "amazing",
      step_reached: 9,
      mistake_row: 7,
      annotations: [
        { row: 1, mark: "tick", note: "ok", tone: "good" },
        { row: 1, mark: "cross", note: "dupe", tone: "fix" },
        { row: 5, mark: "tick", note: "nope", tone: "good" },
        { row: 2, mark: "sparkle", note: "x".repeat(100), tone: "loud" },
      ],
    },
    2,
  );
  assert.equal(result.verdict, "unclear");
  assert.equal(result.stepReached, 5);
  assert.equal(result.mistakeRow, 0);
  assert.deepEqual(result.annotations.map((a) => [a.row, a.mark, a.tone]), [
    [1, "tick", "good"],
    [2, "none", "info"],
  ]);
  assert.equal(result.annotations[1].note.length, 48);
});

test("refusals, truncation and bad JSON become friendly errors", async () => {
  for (const reply of [
    { stop_reason: "refusal", content: [] },
    { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] },
  ]) {
    const tutor = createTutor({ client: fakeClient(reply) });
    await assert.rejects(tutor.feedback({ problem, image: PNG, rowCount: 1 }), TutorError);
  }
});

test("API errors map to typed tutor errors", async () => {
  const error = new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
  const tutor = createTutor({ client: fakeClient(error) });
  await assert.rejects(tutor.feedback({ problem, image: PNG, rowCount: 1 }), (e) => e instanceof TutorError && e.code === "rate_limited");
});
