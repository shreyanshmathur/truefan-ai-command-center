// TrueFan AI Command Center — WhatsApp reminder companion service.
//
// This is a SEPARATE Node process from the (static) React app. It uses
// @open-wa/wa-automate to drive WhatsApp Web, so it needs a long-running host
// and a one-time QR scan. The command-center frontend calls this service's
// HTTP API to send reminders; a daily cron re-sends the last batch.
//
// See README.md for setup and the important WhatsApp Terms-of-Service caveat.

import { create } from "@open-wa/wa-automate";
import express from "express";
import corsMiddleware from "cors";
import cron from "node-cron";

const PORT = Number(process.env.PORT || 4300);
const CRON = process.env.REMINDER_CRON || "0 9 * * *"; // 9:00 every day
const SESSION_ID = process.env.WA_SESSION || "truefan";
const API_KEY = process.env.REMINDER_API_KEY || ""; // optional shared secret

let client = null;
let connected = false;
let lastBatch = []; // remembered so the daily cron can re-send it
let lastRunAt = null;

const app = express();
app.use(corsMiddleware());
app.use(express.json({ limit: "2mb" }));

// Optional API-key gate. If REMINDER_API_KEY is set, callers must send it.
app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.get("x-api-key") === API_KEY) return next();
  return res.status(401).json({ error: "invalid or missing x-api-key" });
});

// Turn "+91 98765 43210" / "9876543210" into a WhatsApp chat id.
function toChatId(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.endsWith("@c.us") ? digits : `${digits}@c.us`;
}

async function sendOne(phone, message) {
  const chatId = toChatId(phone);
  if (!chatId) throw new Error(`invalid phone: ${phone}`);
  return client.sendText(chatId, message);
}

app.get("/health", (req, res) => {
  res.json({ connected, session: SESSION_ID, lastRunAt, remembered: lastBatch.length });
});

// Send a single ad-hoc message (used by the in-app "send test" button).
app.post("/reminders/send", async (req, res) => {
  if (!connected) return res.status(503).json({ error: "WhatsApp not connected yet — scan the QR in the service logs" });
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: "phone and message are required" });
  try {
    await sendOne(phone, message);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

// Send a whole batch: { reminders: [{ phone, message, name? }, ...] }.
// The batch is remembered so the daily cron can re-send it automatically.
app.post("/reminders/run", async (req, res) => {
  if (!connected) return res.status(503).json({ error: "WhatsApp not connected yet" });
  const reminders = Array.isArray(req.body?.reminders) ? req.body.reminders : [];
  if (req.body?.remember !== false) lastBatch = reminders;
  const results = [];
  for (const item of reminders) {
    try {
      await sendOne(item.phone, item.message);
      results.push({ name: item.name, phone: item.phone, ok: true });
    } catch (error) {
      results.push({ name: item.name, phone: item.phone, ok: false, error: String(error?.message || error) });
    }
  }
  lastRunAt = new Date().toISOString();
  res.json({ sent: results.filter((r) => r.ok).length, total: reminders.length, results });
});

async function runRememberedBatch() {
  if (!connected || lastBatch.length === 0) return;
  for (const item of lastBatch) {
    try {
      await sendOne(item.phone, item.message);
    } catch (error) {
      console.error("[cron] failed for", item.phone, String(error?.message || error));
    }
  }
  lastRunAt = new Date().toISOString();
  console.log(`[cron] re-sent ${lastBatch.length} reminder(s)`);
}

async function start() {
  console.log("Starting WhatsApp client — scan the QR code below with WhatsApp > Linked devices …");
  client = await create({
    sessionId: SESSION_ID,
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    cacheEnabled: false,
    restartOnCrash: start,
    useChrome: false,
    throwErrorOnTosBlock: false
  });

  connected = true;
  client.onStateChanged((state) => {
    connected = state === "CONNECTED";
    console.log("[wa] state:", state);
    if (state === "CONFLICT" || state === "UNLAUNCHED") client.forceRefocus();
  });

  app.listen(PORT, () => console.log(`Reminder service listening on http://localhost:${PORT}`));
  cron.schedule(CRON, runRememberedBatch);
  console.log(`Daily reminder cron scheduled: "${CRON}"`);
}

start().catch((error) => {
  console.error("Failed to start reminder service:", error);
  process.exit(1);
});
