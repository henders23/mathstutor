import test from "node:test";
import assert from "node:assert/strict";
import { createApp, parseFeedbackRequest } from "../server.js";
import { TutorError } from "../src/tutor.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

async function withServer(tutor, fn) {
  const server = createApp({ tutor });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, body) =>
  fetch(`${base}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("status reports whether handwriting checking is on", async () => {
  await withServer(null, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { ai: false, model: null });
    const res = await post(base, { problemId: "p1", mode: "check", image: PNG, rowCount: 1 });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "ai_off");
  });
});

test("feedback is passed through from the tutor", async () => {
  let seen;
  const tutor = { model: "fake", feedback: async (req) => ((seen = req), { verdict: "on_track" }) };
  await withServer(tutor, async (base) => {
    const res = await post(base, { problemId: "p2", mode: "hint", image: PNG, rowCount: 3, hintLevel: 2, previousHints: ["a"] });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { feedback: { verdict: "on_track" } });
    assert.equal(seen.problem.id, "p2");
    assert.equal(seen.hintLevel, 2);
  });
});

test("tutor errors keep their status and message", async () => {
  const tutor = { model: "fake", feedback: async () => { throw new TutorError("rate_limited", "busy", 429); } };
  await withServer(tutor, async (base) => {
    const res = await post(base, { problemId: "p1", mode: "check", image: PNG, rowCount: 1 });
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: { code: "rate_limited", message: "busy" } });
  });
});

test("static files are served and path traversal is refused", async () => {
  await withServer(null, async (base) => {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await page.text(), /Maths Tutor/);
    const js = await fetch(`${base}/js/lessons/index.js`);
    assert.match(js.headers.get("content-type"), /javascript/);
    assert.notEqual((await fetch(`${base}/..%2Fserver.js`)).status, 200);
    assert.notEqual((await fetch(`${base}/..%2F.env`)).status, 200);
  });
});

test("request validation", () => {
  const ok = { problemId: "p1", mode: "check", image: PNG, rowCount: 2 };
  assert.equal(parseFeedbackRequest(JSON.stringify(ok)).problem.id, "p1");
  assert.equal(parseFeedbackRequest(JSON.stringify({ ...ok, problemId: "f3" })).problem.lessonId, "formula");
  const bad = [
    "not json",
    { ...ok, problemId: "demo-factorising" },
    { ...ok, problemId: "demo-formula" },
    { ...ok, problemId: "nope" },
    { ...ok, image: "data:image/jpeg;base64,abc" },
    { ...ok, image: "data:image/png;base64,<script>" },
    { ...ok, mode: "solve" },
    { ...ok, rowCount: 99 },
    { ...ok, rowCount: "2" },
  ];
  for (const body of bad) assert.throws(() => parseFeedbackRequest(typeof body === "string" ? body : JSON.stringify(body)), TutorError);
});
