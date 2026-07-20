# WhatsApp reminder service (open-wa)

A small companion service for the **TrueFan AI Command Center** that sends
delivery reminders over WhatsApp using [open-wa / `@open-wa/wa-automate`](https://www.open-wa.org/).

The command-center itself is a static React app and **cannot** run open-wa in the
browser — open-wa automates WhatsApp Web through a headless Chromium and needs a
long-running Node process. This service is that process. The app calls its HTTP
API to send reminders; a daily cron re-sends the last batch automatically.

## ⚠️ Please read first

Automating WhatsApp Web with open-wa is **against WhatsApp's Terms of Service**
and can get a number **rate-limited or banned**. Use a number you control and are
willing to risk, keep volumes low, and only message people who expect it. For
production/at-scale reminders, use the official
[WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp) or an
SMS/email provider instead. This service is provided for internal/self-hosted use.

## Setup

```bash
cd whatsapp-reminders
cp .env.example .env        # optional — edit port / cron / api key
npm install                 # downloads Chromium via puppeteer (first run is slow)
npm start
```

On first run a **QR code** prints in the terminal. Scan it with
**WhatsApp → Linked devices → Link a device**. The session is saved, so restarts
don't need re-scanning.

## API

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | `{ connected, lastRunAt, remembered }` |
| `POST` | `/reminders/send` | `{ phone, message }` | Send one message (used by "Send test") |
| `POST` | `/reminders/run` | `{ reminders: [{ phone, message, name }] }` | Send a batch; remembered for the daily cron |

Phone numbers are any format with a country code (`+91 98765 43210`,
`919876543210`, …) — non-digits are stripped and `@c.us` is appended.

If `REMINDER_API_KEY` is set, every request must include an `x-api-key` header
with the same value (configure it in the app's Reminders page).

## Connect the app

In the command-center, open **Reminders** (Admin), set the **Service URL** to
`http://localhost:4300` (or wherever you host this), add each teammate's phone
number, then **Check connection**, **Send test**, or **Run reminders now**.

## Hosting notes

- Runs anywhere with a persistent Node process + Chromium: a small VPS, a
  Raspberry Pi, Fly.io, Railway, a Docker container, etc. **Not** Netlify static
  hosting or short-lived serverless functions (the WhatsApp session must stay up).
- If the app is served over HTTPS, serve this service over HTTPS too (or run it on
  the same machine) so the browser doesn't block mixed content.
