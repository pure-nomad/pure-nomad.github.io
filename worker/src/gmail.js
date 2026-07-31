// Minimal Gmail API sender using a stored OAuth refresh token.
//
// Module-scope cache: a Worker isolate is frequently reused across
// requests (it's only stateless *guaranteed* across isolate evictions),
// so caching the access token here — with a safety margin before its
// real expiry — avoids a full token-exchange round trip on every warm
// request without risking a stale-token 401 on the Gmail call.
let cachedToken = null; // { accessToken, expiresAt }
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

async function getAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - EXPIRY_SAFETY_MARGIN_MS
  };
  return cachedToken.accessToken;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Strips CR/LF so caller-supplied strings (e.g. a contact form's name)
// can never smuggle extra headers into the raw MIME message.
function headerSafe(str) {
  return str.replace(/[\r\n]/g, " ");
}

function buildMimeMessage({ to, from, subject, text, replyTo }) {
  const headers = [
    `To: ${headerSafe(to)}`,
    `From: ${headerSafe(from)}`,
    `Subject: ${headerSafe(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"'
  ];
  if (replyTo) headers.push(`Reply-To: ${headerSafe(replyTo)}`);
  return `${headers.join("\r\n")}\r\n\r\n${text}`;
}

async function sendViaGmail(env, accessToken, { subject, text, replyTo }) {
  const raw = toBase64Url(buildMimeMessage({
    to: env.TO_EMAIL,
    from: env.TO_EMAIL,
    subject,
    text,
    replyTo
  }));

  return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
}

// replyTo lets the contact form route responses straight to the visitor's
// address; survey submissions omit it since they're anonymous by default.
export async function sendMail(env, { subject, text, replyTo }) {
  let accessToken = await getAccessToken(env);
  let res = await sendViaGmail(env, accessToken, { subject, text, replyTo });

  // A cached token can go stale if it was revoked externally; retry once
  // with a forced refresh before giving up.
  if (res.status === 401) {
    cachedToken = null;
    accessToken = await getAccessToken(env);
    res = await sendViaGmail(env, accessToken, { subject, text, replyTo });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gmail send failed: ${res.status} ${body}`);
  }

  return res.json();
}
