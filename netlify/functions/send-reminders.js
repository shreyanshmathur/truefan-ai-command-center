// Free email reminder sender — runs as a Netlify Function (serverless), so it
// needs no always-on server. Sends via SMTP with nodemailer.
//
// Configure these environment variables in Netlify → Site settings → Environment
// (free with a Gmail App Password — no domain required):
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   465 (SSL) or 587 (STARTTLS)
//   SMTP_USER   your.address@gmail.com
//   SMTP_PASS   a Gmail App Password (https://myaccount.google.com/apppasswords)
//   SMTP_FROM   optional "TrueFan Delivery <your.address@gmail.com>"
//   REMINDER_API_KEY  optional shared secret; if set, callers must send x-api-key
//
// Free alternatives that also work here: Brevo (300/day), Resend (100/day),
// Mailjet, etc. — just point SMTP_HOST/USER/PASS at them.

const nodemailer = require("nodemailer");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, REMINDER_API_KEY } = process.env;
  const configured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

  // Health check — the app's "Check connection" button hits this.
  if (event.httpMethod === "GET") {
    return json(200, { connected: configured, channel: "email" });
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method not allowed" });
  }
  if (REMINDER_API_KEY && event.headers["x-api-key"] !== REMINDER_API_KEY) {
    return json(401, { error: "invalid or missing x-api-key" });
  }
  if (!configured) {
    return json(500, { error: "SMTP env vars not set (SMTP_HOST / SMTP_USER / SMTP_PASS)" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "invalid JSON body" });
  }
  const reminders = Array.isArray(payload.reminders)
    ? payload.reminders
    : (payload.email ? [payload] : []);
  if (reminders.length === 0) {
    return json(400, { error: "no reminders to send" });
  }

  const port = Number(SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  const results = [];
  for (const item of reminders) {
    if (!item.email) {
      results.push({ name: item.name, ok: false, error: "no email" });
      continue;
    }
    try {
      await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: item.email,
        subject: item.subject || "TrueFan delivery reminder",
        text: item.text || item.message || "",
        html: item.html || `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${escapeHtml(item.text || item.message || "")}</pre>`
      });
      results.push({ name: item.name, email: item.email, ok: true });
    } catch (error) {
      results.push({ name: item.name, email: item.email, ok: false, error: String(error?.message || error) });
    }
  }

  return json(200, { sent: results.filter((r) => r.ok).length, total: reminders.length, results });
};

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
}
