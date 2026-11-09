// Maths Tutor server: serves the whiteboard app and proxies handwriting checks to Claude.
// The API key stays on the server; the browser only ever talks to /api/*.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createTutor, DEFAULT_EFFORT, DEFAULT_MODEL, TutorError } from "./src/tutor.js";
import { findProblem } from "./public/js/lessons/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_CHARS = 7 * 1024 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new TutorError("too_large", "That board is too big to send. Try clearing some space.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Validates the browser's request before anything is sent to Claude.
export function parseFeedbackRequest(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new TutorError("bad_request", "Request body must be JSON.", 400);
  }
  const problem = findProblem(data?.problemId);
  if (!problem || problem.demo) throw new TutorError("bad_request", "Unknown practice question.", 400);
  if (typeof data.image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.image))
    throw new TutorError("bad_request", "Expected a PNG image of the board.", 400);
  if (data.image.length > MAX_IMAGE_CHARS) throw new TutorError("too_large", "That board image is too large.", 413);
  const mode = data.mode === "hint" ? "hint" : data.mode === "check" ? "check" : null;
  if (!mode) throw new TutorError("bad_request", "mode must be 'check' or 'hint'.", 400);
  const rowCount = Number.isInteger(data.rowCount) && data.rowCount >= 0 && data.rowCount <= 40 ? data.rowCount : null;
  if (rowCount === null) throw new TutorError("bad_request", "rowCount must be an integer from 0 to 40.", 400);
  const hintLevel = Number.isInteger(data.hintLevel) ? Math.min(3, Math.max(1, data.hintLevel)) : 1;
  const previousHints = (Array.isArray(data.previousHints) ? data.previousHints : [])
    .filter((h) => typeof h === "string")
    .slice(0, 3)
    .map((h) => h.slice(0, 400));
  return { problem, image: data.image, rowCount, mode, hintLevel, previousHints };
}

function rateLimiter() {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length <= RATE_LIMIT.max;
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Forbidden");
  try {
    const content = await fs.readFile(file);
    send(res, 200, content, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

// tutor: object with feedback(request) → Promise<feedback>, or null when AI checking is off.
export function createApp({ tutor }) {
  const allow = rateLimiter();
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, "http://localhost");
      if (pathname === "/api/status" && req.method === "GET") {
        return sendJson(res, 200, { ai: Boolean(tutor), model: tutor?.model ?? null });
      }
      if (pathname === "/api/feedback") {
        if (req.method !== "POST") return sendJson(res, 405, { error: { code: "method", message: "Use POST." } });
        if (!tutor)
          return sendJson(res, 503, {
            error: { code: "ai_off", message: "Handwriting checking isn't set up on this server (no ANTHROPIC_API_KEY)." },
          });
        if (!String(req.headers["content-type"] ?? "").startsWith("application/json"))
          return sendJson(res, 415, { error: { code: "content_type", message: "Send JSON." } });
        if (!allow(req.socket.remoteAddress ?? "unknown"))
          return sendJson(res, 429, { error: { code: "rate_limited", message: "Slow down a little — try again in a minute." } });
        const request = parseFeedbackRequest(await readBody(req));
        const feedback = await tutor.feedback(request);
        return sendJson(res, 200, { feedback });
      }
      if (pathname.startsWith("/api/")) return sendJson(res, 404, { error: { code: "not_found", message: "Unknown endpoint." } });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return serveStatic(req, res);
    } catch (error) {
      if (error instanceof TutorError) return sendJson(res, error.status, { error: { code: error.code, message: error.message } });
      console.error(error);
      return sendJson(res, 500, { error: { code: "server", message: "Something went wrong on the server." } });
    }
  });
}

function tutorFromEnv(env) {
  const hasCredentials = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) || env.TUTOR_AI === "on";
  if (!hasCredentials || env.TUTOR_AI === "off") return null;
  return createTutor({
    client: new Anthropic(),
    model: env.TUTOR_MODEL || DEFAULT_MODEL,
    effort: env.TUTOR_EFFORT || DEFAULT_EFFORT,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  const tutor = tutorFromEnv(process.env);
  createApp({ tutor }).listen(port, host, () => {
    console.log(`Maths Tutor running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    console.log(
      tutor
        ? `Handwriting checking: on (model ${tutor.model}, effort ${process.env.TUTOR_EFFORT || DEFAULT_EFFORT})`
        : "Handwriting checking: off — set ANTHROPIC_API_KEY to turn it on (typed answers still work).",
    );
  });
}
