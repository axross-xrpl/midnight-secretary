# Zee-Kwat Private Agent (ZKP Agent)

An AI secretary that arranges business trips off your calendar and pays for them on Midnight.
Built by Team Gecko for the Midnight Buildathon.

It reads the next 30 days of your Google Calendar, finds the trips nobody has arranged yet, and works
out a plan for each one -- transport, a hotel if the trip runs overnight, somewhere to eat, somewhere to
go -- inside the budget and the tastes on your profile. You approve it once. It then settles every
booking from a spending allowance that lives in a Midnight contract and writes the finished itinerary
back to the calendar.

Two things run on Midnight rather than beside it:

- **The money.** A trip is paid booking by booking against an allowance the contract enforces, and any
  booking can be settled privately instead, so what you spent on dinner is not on a public ledger next
  to the train fare.
- **Your age.** A restaurant that serves alcohol asks whether you are old enough. The secretary answers
  with a proof that you were born on or before a cutoff worked out from the date of departure. The
  answer is a yes or a no; the date of birth is not part of it, and what the chain keeps is a
  commitment to it rather than the date.

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
20 years before the server start date plus 7 days (2006-09-21 for a server started on 2026-09-14).
Pressing **計画を承認する** on a plan that includes an age-restricted place does not call the server yet:
the secretary first asks whether it may send the age proof, and you answer **証明を送る** or
**今はやめておく**. The proof is taken as of the departure date. For the earlier trip it does not pass, so
the secretary asks whether it may rebuild the plan from the places with no age limit; answer
**組み直す** and it proposes the rebuilt plan (中之島カフェ here, 30,120 MST). Approve that plan and the
rest of the path runs with no proof at all. For the trip three days later the proof passes and the
approval goes through. The date of birth is never passed to the AI; it is registered only with the
identity lane (in memory in demo mode).

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

### With Gemini as the planner

Set `GEMINI_API_KEY` (Google AI Studio) in `.env.local`, keep `SECRETARY_MODE=demo`, and add
`SECRETARY_PLANNER=real`. The other ports stay fake, so the secretary's proposals are written by
Gemini while the calendar, the fare catalog, and the spending allowance are stand-ins. Gemini only
answers whether an event is a trip, which catalog destination it targets, and which offer ids to
pick; dates come from the event and prices from the catalog. `GEMINI_MODEL` overrides the default
model (`gemini-3.5-flash-lite`).

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

Each real port reads its own variables (listed in `.env.example`) from `.env.local`; a missing one does
not stop the server but makes that port's calls fail:

| Port | Variable | Read when |
| --- | --- | --- |
| catalog | `DATABASE_URL` | the first catalog query (`unavailable` when missing) |
| planner | `GEMINI_API_KEY`, `GEMINI_MODEL` (optional) | every proposal (`planner.llm` when the key is missing) |
| mandate | `MANDATE_SETTLEMENT_RECIPIENT` | every payment (`unavailable` when missing) |
| profile | `DATABASE_URL` | the age proof reads the date of birth from the profile page's table |
| identity | `AGE_VERIFICATION_ADDRESS`, `AGE_VERIFICATION_DOB`, `AGE_VERIFICATION_SEED` (in `contract/.env`, read by the contract server) | issuing the credential and every age proof (`unavailable` when the contract server has no age verification) |

`SECRETARY_IDENTITY=real` issues the credential and proves the age through the contract server's
`/age-verification/*` routes. What is real there is the circuit, the proof, and the on-chain record:
the date of birth is registered as a commitment on the deployed age-verification contract, and each
proof is a transaction whose id becomes the proof reference. What is not real is who holds the
secrets. The date of birth and the identity secret stay with the contract server (the app sends the
date of birth to it over loopback HTTP), not with the user, so this is a dev stand-in for the flow
where a wallet on the user's side proves without ever sending them anywhere. The contract server
needs `AGE_VERIFICATION_ADDRESS`, `AGE_VERIFICATION_DOB`, and `AGE_VERIFICATION_SEED` in
`contract/.env`, and `AGE_VERIFICATION_SEED` must be a different value from `DEPLOYER_SEED`:
`deploy-age-verification` writes a private state with a date of birth of 0 under the deployer's
account, so with the same seed `AGE_VERIFICATION_DOB` is ignored and every proof comes out as
"adult".

`SECRETARY_STORE=real` writes the confirmed itinerary to NeonDB (`trips` and `trip_items`) once the trip
is on the calendar, and reads the Confirmed tab from there, so it needs `DATABASE_URL`. Trips in progress
(proposed, approved, paid) still live in memory and are lost on restart. Writing needs
`SECRETARY_CATALOG=real` as well, because each line item points at the service row it was booked from and
only the real catalog can look those ids up; with the fake catalog the calendar entry still succeeds and
the conversation says the itinerary could not be saved.
