// Minimal Gmail API sender using a stored OAuth refresh token.
// Exchanges the refresh token for a short-lived access token on every
// invocation (Workers are stateless between requests, so there's no
// point caching it across invocations without KV/DO — a token exchange
// is cheap and avoids stale-token edge cases).
async function getAccessToken(env) {
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
  return data.access_token;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMimeMessage({ to, from, subject, text }) {
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"'
  ].join("\r\n");
  return `${headers}\r\n\r\n${text}`;
}

export async function sendMail(env, { subject, text }) {
  const accessToken = await getAccessToken(env);
  const raw = toBase64Url(buildMimeMessage({
    to: env.TO_EMAIL,
    from: env.TO_EMAIL,
    subject,
    text
  }));

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gmail send failed: ${res.status} ${body}`);
  }

  return res.json();
}
