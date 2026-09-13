This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

Node.js 24 is pinned with [mise](https://mise.jdx.dev/). Install mise, then run:

```bash
mise trust     # trust this repository's mise.toml
mise install   # install the pinned Node.js
npm install    # install dependencies (this also installs the git hooks)
```

## Run it

Every port (calendar, fare catalog, planner, spending allowance, storage) can be served either by the
real system or by an in-process fake, so the app runs with nothing else set up.

### Demo: no Google project, database, LLM key, or Midnight node

```bash
cp .env.example .env.local
# .env.local: set NEXTAUTH_SECRET (openssl rand -base64 32) and uncomment SECRETARY_MODE=demo
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the dev sign-in button. Every page
carries a line naming the ports that are stand-ins. The source variables are read when the server
starts, so `SECRETARY_MODE=demo npm start` works as well; a misconfiguration stops the server there
instead of degrading at runtime.

Then open [http://localhost:3000/ja/tasks/seed-2](http://localhost:3000/ja/tasks/seed-2) directly (the
task list will link to it in a later change) and walk the one path as a conversation with the secretary:
press **計画を提案して** (the first proposal sets up a 200,000 MST spending allowance for you), then
approve, pay, and add the trip to the calendar from the reply buttons. `seed-3` is a one-night trip that
adds lodging and draws on the same allowance; `seed-1` shows the secretary declining an event that is
not a trip; `seed-9` is not on the calendar. The ledger panel in the sidebar (below the conversation on a
narrow window) counts each payment on the public side while the cap and the spent amount stay on the
private side. Everything lives in memory, so restarting the server starts over.

The dev sign-in trusts whoever clicks the button, so it only starts when `NEXTAUTH_URL` points at
localhost, and it forces the calendar to the fake (that session has no Google token).

### With your own Google Calendar

1. In the Google Cloud Console, create a project and enable the Google Calendar API.
2. Create an OAuth client (Web application) with the redirect URI
   `http://localhost:3000/api/auth/callback/google`, and add your account as a test user on the
   consent screen.
3. In `.env.local`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and
   `NEXTAUTH_URL=http://localhost:3000`, and leave `SECRETARY_MODE` unset (everything real).
4. `npm run build && npm start`, sign in with Google, then open **Tasks** and scan the calendar.

To keep the real calendar while the ports other lanes own stay fake, set only what you need, for
example `SECRETARY_CATALOG=fake`.

### Source variables

| Variable | Values | Default |
| --- | --- | --- |
| `SECRETARY_MODE` | `normal`, `demo` | `normal` |
| `SECRETARY_AUTH` | `google`, `dev` | from the mode |
| `SECRETARY_CALENDAR` | `real`, `fake` | from the mode |
| `SECRETARY_CATALOG` | `real`, `fake` | from the mode |
| `SECRETARY_PLANNER` | `real`, `fake` | from the mode |
| `SECRETARY_MANDATE` | `real`, `fake` | from the mode |
| `SECRETARY_STORE` | `real`, `fake` | from the mode |

Precedence: a per-port variable beats `SECRETARY_MODE`, which beats the `normal` default (everything real).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
