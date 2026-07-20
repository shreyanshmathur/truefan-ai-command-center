# TrueFan AI Command Center

Internal operations command center for TrueFan AI Sales, Delivery, Finance, and Admin teams.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Fixed Demo Logins

| Section | Username | Password |
| --- | --- | --- |
| Sales | `sales` | `sales@truefan` |
| Delivery | `delivery` | `delivery@truefan` |
| Finance | `finance` | `finance@truefan` |
| Admin | `admin` | `admin@truefan` |

Each teammate can also sign in individually with their first name and
`firstname@truefan` (e.g. `rajat` / `rajat@truefan`) — DMs and SDMs get their
own login this way.

## Reminders

The **Reminders** page (Admin/Delivery) emails people about overdue / due-soon
tasks and open escalations. Sending is handled by a free Netlify Function
(`netlify/functions/send-reminders.js`) over SMTP — no extra server.

Add free SMTP credentials (e.g. a **Gmail App Password**) as Netlify env vars:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (optional `SMTP_FROM`,
`REMINDER_API_KEY`). Recipient emails are prefilled from each user and editable
on the page.

## Insights & AI

- **Insights** page — pipeline, throughput, revenue, health, and capacity
  charts derived entirely from the data's existing timestamps. Client-side, no
  cost.
- **Cmd/Ctrl-K** — a command palette to jump to any page, project, or task.
- **AI project summary** — the "Summarise with AI" button on Project Detail
  calls `netlify/functions/ai-summary.js`, which proxies **Google Gemini**
  (free tier). Set `GEMINI_API_KEY` (from
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey), optional
  `GEMINI_MODEL`) in Netlify env vars to enable; the key stays server-side.

## Build And Test

```bash
npm run build
npm run test:ui
```

## Deploy Options

### Vercel

Import the GitHub repo in Vercel. Vercel will use:

- Build command: `npm run build`
- Output directory: `dist`

The included `vercel.json` handles SPA routing.

### Netlify

Import the GitHub repo in Netlify. Netlify will use the included `netlify.toml`.

### GitHub Pages

The included GitHub Actions workflow can deploy the app to Pages when manually run.

For private repositories, GitHub Pages requires a plan that supports private Pages. If the repository is public or private Pages is available:

1. Open the repository on GitHub.
2. Go to `Settings -> Pages`.
3. Set source to `GitHub Actions`.
4. Run the `Deploy to GitHub Pages` workflow.

## Notes

The app is currently a frontend-only Vite app using local browser storage for demo data. The heavy WhatsApp video reference is intentionally ignored by git; heavy videos should be stored as external links in production.
