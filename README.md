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

The included GitHub Actions workflow deploys the app to Pages on every push to `main`.

After pushing the repo:

1. Open the repository on GitHub.
2. Go to `Settings -> Pages`.
3. Set source to `GitHub Actions`.
4. Run the `Deploy to GitHub Pages` workflow or push to `main`.

## Notes

The app is currently a frontend-only Vite app using local browser storage for demo data. The heavy WhatsApp video reference is intentionally ignored by git; heavy videos should be stored as external links in production.
