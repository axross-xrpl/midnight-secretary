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

Then open **Tasks** ([http://localhost:3000/ja/tasks](http://localhost:3000/ja/tasks)) and press
**カレンダーをスキャン** on the 検知 tab. The next 30 days of the calendar are read and the events that are
not arranged yet are listed, and **秘書に相談** on a row opens that event's conversation with the
secretary. Start with 大阪出張 (取引先訪問) and walk the one path: press **計画を提案して** (the first
proposal sets up a 200,000 MST spending allowance for you), then approve, pay, and add the trip to the
calendar from the reply buttons. Back in **Tasks**, a trip that is still under way sits under
**手配中の出張** with its status, a trip that has reached the calendar moves to the **確定旅程** tab, and
the event the secretary wrote back does not appear in the scan results.
大阪出張 (展示会) is a one-night trip that adds lodging and draws on the same allowance; チーム定例 shows
the secretary declining an event that is not a trip. In demo mode each payment can be kept private
before approval (a shielded transfer in the fake ledger); the real mandate adapter declares whether it
supports that, and the toggle is hidden when it does not.
The ledger panel in the sidebar of the conversation
(below it on a narrow window) counts each payment on the public side while the cap and the spent amount
stay on the private side. Everything lives in memory, so restarting the server starts over.

大阪出張 (取引先と懇親会) and 大阪出張 (パートナー会食) each include an izakaya (age 20 or over), so the
plan totals 31,920 MST and the payment is three bookings; the izakaya row carries the same "keep private"
switch as the transport rows. 大阪出張 (工場視察と懇親会) is the one-night trip where every category
meets: lodging, the izakaya and a leisure place (the first one for the destination that asks for no
verification, 海遊館 here), so the plan totals 47,120 MST, the payment is five bookings, and each row can
be kept private on its own. The demo profile is fixed: the date of birth is
20 years before the server start date plus 7 days (2006-09-21 for a server started on 2026-09-14). When
you approve, the secretary proves that the traveler is an adult as of the departure date. The earlier
trip cannot be approved ("not yet 20 on that day"), while the trip three days later passes the proof and
can be approved. The date of birth is never passed to the AI; it is registered only with the identity
lane (in memory in demo mode).

The dev sign-in trusts whoever clicks the button, so it only starts when `NEXTAUTH_URL` points at
localhost, and it forces the calendar to the fake (that session has no Google token).

### With your own Google Calendar

1. In the Google Cloud Console, create a project and enable the Google Calendar API.
2. Create an OAuth client (Web application) with the redirect URI
   `http://localhost:3000/api/auth/callback/google`, and add your account as a test user on the
   consent screen.
3. In `.env.local`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and
   `NEXTAUTH_URL=http://localhost:3000`, and leave `SECRETARY_MODE` unset (everything real).
4. `npm run build && npm start`, sign in with Google, then open **Tasks** and scan the calendar; the
   next 30 days of your calendar are listed there.

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
| `SECRETARY_IDENTITY` | `real`, `fake` | from the mode |
| `SECRETARY_PROFILE` | `real`, `fake` | from the mode |

Precedence: a per-port variable beats `SECRETARY_MODE`, which beats the `normal` default (everything real).

`SECRETARY_PROFILE=real` reads the date of birth from the profile in NeonDB (the profile page's table) and
needs `DATABASE_URL`; `SECRETARY_IDENTITY=real` still runs the in-process fake until the contract server
exposes the age verification endpoints.

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
