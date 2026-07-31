import { validateAnswers, SCHEMA } from "./schema.js";
import { sendMail } from "./gmail.js";

const RATE_LIMIT_MAX = 5;          // submissions
const RATE_LIMIT_WINDOW = 3600;    // seconds

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) }
  });
}

async function checkRateLimit(env, ip) {
  const key = `rl:${ip}`;
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  return true;
}

function formatEmail(answers, meta) {
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, env);
    }

    const origin = request.headers.get("Origin");
    if (origin !== env.ALLOWED_ORIGIN) {
      return json({ error: "forbidden origin" }, 403, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400, env);
    }

    // Honeypot: survey.html includes a hidden "company" field that real
    // users never see or fill. Any value there means a bot filled every
    // field on the form, so accept-and-drop rather than error (doesn't
    // tip bots off that they were caught).
    if (body.company) {
      return json({ ok: true }, 200, env);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await checkRateLimit(env, ip);
    if (!allowed) {
      return json({ error: "rate limit exceeded, try again later" }, 429, env);
    }

    let cleanedAnswers;
    try {
      cleanedAnswers = validateAnswers(body.answers);
    } catch (err) {
      return json({ error: err.message }, 422, env);
    }

    const submittedAt = typeof body.submitted_at === "string" ? body.submitted_at : new Date().toISOString();
    const source = typeof body.source === "string" ? body.source.slice(0, 200) : "unknown";

    const text = formatEmail(cleanedAnswers, { submitted_at: submittedAt, source, ip });

    try {
      await sendMail(env, {
        subject: "Signal Check — new survey response",
        text
      });
    } catch (err) {
      return json({ error: "failed to send" }, 502, env);
    }

    return json({ ok: true }, 200, env);
  }
};
