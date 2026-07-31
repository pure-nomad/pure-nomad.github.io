import { validateAnswers, SCHEMA, validateContact } from "./schema.js";
import { sendMail } from "./gmail.js";

// Contact form is a live sales/lead channel — a real prospect emailing in
// is worth more than one more survey response, and its free-text surface
// (name/email/message) draws more bot traffic than a fixed-choice survey.
// So it gets a tighter per-IP budget.
const RATE_LIMITS = {
  survey: { max: 5, windowSeconds: 3600 },
  contact: { max: 3, windowSeconds: 3600 }
};

const MAX_BODY_BYTES = 20_000; // generous for either form; rejects garbage early

function isOriginAllowed(origin, env) {
  if (!origin) return true; // Non-browser or same-origin requests without Origin header
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) return true;
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
  return false;
}

function corsHeaders(env, origin) {
  const allowed = isOriginAllowed(origin, env) ? (origin || env.ALLOWED_ORIGIN || "*") : (env.ALLOWED_ORIGIN || "*");
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, env, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env, origin) }
  });
}

async function checkRateLimit(env, kind, ip) {
  if (!env.RATE_LIMIT) return true; // Gracefully allow if KV namespace is missing/unbound
  const { max, windowSeconds } = RATE_LIMITS[kind];
  const key = `rl:${kind}:${ip}`;
  try {
    const current = await env.RATE_LIMIT.get(key);
    const count = current ? parseInt(current, 10) : 0;
    if (count >= max) return false;
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds });
  } catch {
    // Fail-open if KV lookup fails temporarily
    return true;
  }
  return true;
}

function formatSurveyEmail(answers, meta) {
  const lines = [];
  SCHEMA.forEach(phase => {
    const present = phase.questions.filter(q => q.id in answers);
    if (!present.length) return;
    lines.push(`--- ${phase.id.toUpperCase()} ---`);
    present.forEach(q => {
      const v = answers[q.id];
      lines.push(`${q.id}: ${Array.isArray(v) ? v.join(", ") : v}`);
    });
    lines.push("");
  });
  lines.push("--- META ---");
  lines.push(`submitted_at: ${meta.submitted_at}`);
  lines.push(`source: ${meta.source}`);
  lines.push(`ip: ${meta.ip}`);
  return lines.join("\n");
}

function formatContactEmail(contact, meta) {
  const lines = [
    `From: ${contact.name} <${contact.email}>`,
    `Subject: ${contact.subject || "(none)"}`,
    "",
    contact.message,
    "",
    "--- META ---",
    `submitted_at: ${meta.submitted_at}`,
    `source: ${meta.source}`,
    `ip: ${meta.ip}`
  ];
  return lines.join("\n");
}

async function readJsonBody(request) {
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    throw new Error("payload too large");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("payload too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON");
  }
}

async function handleSurvey(request, env, ip, origin) {
  const allowed = await checkRateLimit(env, "survey", ip);
  if (!allowed) return json({ error: "rate limit exceeded, try again later" }, 429, env, origin);

  let body;
  try {
    body = await readJsonBody(request);
  } catch (err) {
    return json({ error: err.message }, err.message === "payload too large" ? 413 : 400, env, origin);
  }

  // Honeypot: survey.html includes a hidden "company" field that real
  // users never see or fill. Any value there means a bot filled every
  // field on the form, so accept-and-drop rather than error (doesn't
  // tip bots off that they were caught).
  if (body.company) return json({ ok: true }, 200, env, origin);

  let cleanedAnswers;
  try {
    cleanedAnswers = validateAnswers(body.answers);
  } catch (err) {
    return json({ error: err.message }, 422, env, origin);
  }

  const submittedAt = typeof body.submitted_at === "string" ? body.submitted_at : new Date().toISOString();
  const source = typeof body.source === "string" ? body.source.slice(0, 200) : "unknown";
  const text = formatSurveyEmail(cleanedAnswers, { submitted_at: submittedAt, source, ip });

  try {
    await sendMail(env, { subject: "Signal Check — new survey response", text });
  } catch {
    return json({ error: "failed to send" }, 502, env, origin);
  }

  return json({ ok: true }, 200, env, origin);
}

async function handleContact(request, env, ip, origin) {
  const allowed = await checkRateLimit(env, "contact", ip);
  if (!allowed) return json({ error: "rate limit exceeded, try again later" }, 429, env, origin);

  let body;
  try {
    body = await readJsonBody(request);
  } catch (err) {
    return json({ error: err.message }, err.message === "payload too large" ? 413 : 400, env, origin);
  }

  // Honeypot mirrors the survey's: a hidden "company" field real visitors
  // never see or fill.
  if (body.company) return json({ ok: true }, 200, env, origin);

  let cleaned;
  try {
    cleaned = validateContact(body);
  } catch (err) {
    return json({ error: err.message }, 422, env, origin);
  }

  const submittedAt = typeof body.submitted_at === "string" ? body.submitted_at : new Date().toISOString();
  const source = typeof body.source === "string" ? body.source.slice(0, 200) : "unknown";
  const text = formatContactEmail(cleaned, { submitted_at: submittedAt, source, ip });

  try {
    await sendMail(env, {
      subject: `Site contact — ${cleaned.subject || cleaned.name}`,
      text,
      replyTo: cleaned.email
    });
  } catch {
    return json({ error: "failed to send" }, 502, env, origin);
  }

  return json({ ok: true }, 200, env, origin);
}

const ROUTES = {
  "/survey": handleSurvey,
  "/contact": handleContact
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env, origin) });
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, env, origin);
    }

    if (!isOriginAllowed(origin, env)) {
      return json({ error: "forbidden origin" }, 403, env, origin);
    }

    const { pathname } = new URL(request.url);
    const handler = ROUTES[pathname];
    if (!handler) return json({ error: "not found" }, 404, env, origin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    return handler(request, env, ip, origin);
  }
};
