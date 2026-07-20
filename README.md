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

The **Reminders** page (Admin/Delivery) nudges people about overdue / due-soon
tasks and open escalations, over two channels:

- **Email (free, recommended).** A Netlify Function
  (`netlify/functions/send-reminders.js`) sends over SMTP — no extra server.
  Add free SMTP credentials (e.g. a **Gmail App Password**) as Netlify env vars:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (optional `SMTP_FROM`,
  `REMINDER_API_KEY`). Recipient emails are prefilled from each user.
- **WhatsApp (self-hosted).** The `whatsapp-reminders/` service uses
  [open-wa](https://www.open-wa.org/); see its README. Needs a persistent host
  and a QR scan, and is against WhatsApp's ToS — email is the simpler free path.

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
