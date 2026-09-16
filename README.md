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

## Start here

| To see | Go to | Takes |
| --- | --- | --- |
| The whole flow, end to end, with every port real | TODO: demo video URL | 5 min |
| It running on your machine with nothing else set up | [Demo](#demo-no-google-project-database-llm-key-or-midnight-node) below: a few commands | 5 min |
| What the contracts hold and hide | [Midnight integration](#midnight-integration), then `contract/compact/` (three files, commented) | 10 min |
| What is proven by tests and CI | [Tests and CI](#tests-and-ci): `npm test` runs 731 tests in about five seconds | 2 min |
| A real settlement on a local Midnight devnet | [With a Midnight devnet](#with-a-midnight-devnet-real-payments) | 30 min |

The parts that are stand-ins are listed in the next section, and each page of the app says which
ones it is running on.

## What is real and what is a stand-in

Every port the secretary depends on has a real adapter and an in-process fake. `SECRETARY_MODE=demo`
selects every fake at once; leaving it unset selects every real adapter; a per-port variable overrides
either (the [table](#source-variables) is below).

| Port | Real | Fake (demo) |
| --- | --- | --- |
| auth | Google sign-in | dev sign-in button (localhost only) |
| calendar | Google Calendar API | seeded events in memory (five Osaka trips and two non-trips) |
| catalog | NeonDB service tables (transport, places) | the same shape, seeded in memory |
| planner | Gemini decides which event is a trip and which offers to pick | a deterministic planner that reads the event title |
| mandate | `token.compact` and `shielded-token.compact` through the contract server | a ledger in memory with the same public and private split |
| store | NeonDB `trips` / `trip_items` for confirmed itineraries | in memory |
| profile | NeonDB `user_profiles` (name, tastes, date of birth, and a wallet address filled from a connected Midnight wallet) | one fixed profile |
| identity | `age-verification.compact` through the contract server, one pseudonym per traveler | a credential registry in memory |

In demo mode the age check and the private payment happen in the fakes, so they show the flow but
prove nothing. With `SECRETARY_MANDATE=real` the payments are real transactions on a Midnight devnet.
With `SECRETARY_IDENTITY=real` the circuit, the proof and the on-chain record are real, but the secrets
pass through the contract server rather than staying with the traveler; see
[What we do not claim](#what-we-do-not-claim).

## Architecture

```text
 Browser (Next.js app, ja / en)
   Home  ·  Tasks (scan, trips under way, confirmed)  ·  Tasks/[event] conversation  ·  Settings
   Settings/profile's Connect Wallet button talks to a wallet extension (window.midnight, DApp Connector API)
        |
        v  route handlers: /api/calendar/scan, /api/secretary/{trips,mandate,age-credential,...}
 +----------------------------------------------------------------------------------------------------+
 |  application: use cases (scan, propose, approve, replan, pay, write back)                          |
 |  ports (types in src/domain): calendar · catalog · planner · mandate · store · profile · identity  |
 +----------------------------------------------------------------------------------------------------+
        |  one port is built per request from SECRETARY_* (real or fake), src/application/wiring.ts
        v
 real adapters                                     fake adapters (in memory)
   Google Calendar API                                seeded events
   NeonDB: catalog, store, profile                    seeded catalog, stores, one profile
   Gemini (@google/genai)                             title-based planner
   contract server over loopback HTTP  ---------->    ledger with the same public/private split
     (mandate, identity)                              credential registry
        |
        v
 contract/src/server.ts  (one wallet, connected to the deployed contracts, http://127.0.0.1:4900)
   POST /token/pay · POST /shielded-token/pay
   GET /age-verification/registration · POST /age-verification/register · POST /age-verification/prove
        |
        v
 Midnight devnet (devnet.yml: node 1.0.0, indexer 4.3.3, proof-server 8.1.0)
   token.compact · shielded-token.compact · age-verification.compact   (Compact 0.31.1)
```

The use cases are pure functions over the ports, and every port is a type in `src/domain`. I/O and
non-determinism (clock, ids, environment) come in as arguments, which is what lets the same use cases
run against the fakes in tests and in demo mode, and against Google, Neon, Gemini and Midnight in
normal mode. The composition root reads `SECRETARY_*` once at server start and refuses to start on a
bad combination, so a misconfiguration fails there instead of degrading at runtime.

The Next.js server never imports the Midnight SDK. The contract server in `contract/` keeps one wallet
synced and connected to the three deployed contracts, and the app calls it over loopback HTTP. That
pays the wallet sync once at the server's start rather than per request, and keeps the SDK's module
graph out of the app's. The one Midnight package in the app is the DApp Connector API, which the
profile page uses in the browser to read the connected wallet's unshielded address.

## Midnight integration

Three Compact contracts, compiled with Compact 0.31.1 (`contract/scripts/compile.sh`, and the same
version in CI). For each: what stays private, what the ledger holds, and which operations are
transactions.

### `token.compact`: the spending allowance and public payments

| | |
| --- | --- |
| Witness (never on chain) | `getOwnerSecretKey()`: the owner's secret. The ledger holds only `contractOwner`, a hash derived from it |
| Public ledger | `_name`, `_symbol`, `tokenColor`, `supplyMinted`, `sendAllowance` (the remaining budget) |
| Transactions | `mintSupply` (owner, once: mints the fixed supply to the contract itself), `setSendAllowance` (owner: sets the budget to an absolute value), `sendToken(recipient, amount)` (owner: asserts `amount <= sendAllowance`, subtracts it, and sends unshielded, in one circuit) |
| Reads | `getTokenInfo` bundles the four getters so a display state costs one call |

In the app, each public payment is one `sendToken`. The owner check, the budget check, the
decrement and the transfer are one circuit, so a payment cannot be authorized without being paid or
paid without being counted against the budget. The transaction id comes back to the conversation as
the public hash of that payment. The budget on chain is the one the contract owner granted at deploy
time (`SEND_ALLOWANCE` in `contract/.env`, changed with `npm run set-allowance`); the cap the traveler
grants the secretary in the conversation is a second, per-mandate limit that the mandate adapter
checks before it calls the contract. A fresh deployment has an allowance of 0 on purpose: a leaked
agent process on a new contract has no budget rather than the whole supply.

### `shielded-token.compact`: private payments

| | |
| --- | --- |
| Witnesses | `minterSecretKey()` (the ledger holds only the derived `minter` key), `localNonceSeed()` (the nonce for each coin is derived from it and never published) |
| Public ledger | `token_color`, `initialized`, `mints` (a counter), `minter`, `mintAllowance` |
| Transactions | `setMintAllowance` (minter), `mint_and_send(recipient, amount, nonceIndex)` (minter: asserts `amount <= mintAllowance`, mints a shielded coin and sends it immediately to the recipient) |

A booking marked "keep private" is settled with `mint_and_send` instead of `sendToken`. What reaches
the public transcript was read off the generated circuit and is written above the circuit in the
source: the amount is public (every mint pushes it into the ledger's supply accounting), the recipient
is not published (only a hash of the coin and the recipient key is, and the nonce inside it comes from
the witness). The real mandate adapter declares whether it supports private settlement, and the toggle
in the conversation is hidden when it does not.

### `age-verification.compact`: proving an age without the date of birth

| | |
| --- | --- |
| Witnesses | `dateOfBirth()` as `YYYYMMDD` in a `Uint<32>`, `dobSalt()` (hiding randomness: there are only about 40,000 plausible birthdates, so an unsalted hash would be brute-forced), `identitySecret()` |
| Public ledger | `registrations: Map<identity, commitment>`, one entry per pseudonymous identity |
| Transactions | `register()` (once per identity: inserts `persistentCommit(dob, secret, salt)`; re-registration is refused so a birthdate cannot be swapped after a cutoff is known), `proveAdult(cutoffDate)` (asserts the identity is registered and that the witness matches the stored commitment, then returns `disclose(dateOfBirth() <= cutoffDate)`) |

| The verifier learns | The chain keeps | Stays with the holder |
| --- | --- | --- |
| a yes or a no for one cutoff date, and which registered identity answered | the commitment, the identity (a hash of the secret, not a wallet address), and the transaction | the date of birth, the salt, the identity secret |

`proveAdult` returns the answer rather than asserting on it, so a "no" is a settled result a
merchant can observe instead of a failed transaction that looks like a network error. The cutoff is
supplied by the verifier (the circuit has no clock); the secretary uses the date of departure minus the
place's age limit (20 years for an izakaya, the purchase age for alcohol in Japan).

In the app: the traveler issues a credential from the profile page (`register`). When a plan includes
an age-restricted place, approving it first asks whether the secretary may send the proof. On "send"
the proof is made for the departure date; if it fails, the secretary offers to rebuild the plan from
the places with no age limit rather than dropping the trip. The date of birth is never passed to the
AI planner.

## What we do not claim

Written here so the video and the README cannot promise more than the code does.

- **Who holds the age secrets.** With `SECRETARY_IDENTITY=real`, the app names each traveler by an
  opaque pseudonym, the contract server derives that traveler's identity secret and salt from it and
  keeps their private state under it, and the app sends the date of birth to the server over loopback
  HTTP when the credential is issued. The proof is real and per traveler; the holder is the server,
  not the traveler. This is a stand-in for the flow where the date of birth and the secret stay on
  the traveler's side and the proof is made from the connected wallet.
- **Public payments are public.** `sendAllowance` and the amount and recipient of every `sendToken`
  are readable on chain. The ledger panel's picture (payment count public, cap and spent private) is
  exact for the in-memory ledger and not for real public payments. Only bookings marked "keep
  private" hide the recipient, and even there the minted amount is public.
- **Payments go to one fixed address.** The catalog's payees are placeholder strings, not Midnight
  addresses, so every real payment goes to `MANDATE_SETTLEMENT_RECIPIENT` (or its shielded twin) and
  the conversation records the catalog's payee separately.
- **One owner, one allowance.** A deployment of `token.compact` has one owner key and one
  `sendAllowance`, granted at deploy time. The cap a traveler grants the secretary is enforced by the
  mandate adapter in the app's process, not by the contract, so on chain the budget is per deployment,
  not per traveler.
- **Which identity proved is visible.** `proveAdult` derives the identity from the witness and looks
  it up in the registration map, and a map key is a public argument to every `member()` / `lookup()`,
  so repeated proofs by the same pseudonym are linkable. Hiding that means a Merkle tree of
  commitments with a witness-supplied path; noted in the circuit's comments, not built.
- **Devnet only.** Nothing is deployed to a public Midnight network in Wave 1. The settlement was
  verified on a local devnet (numbers under [Tests and CI](#tests-and-ci)).
- **Demo mode's clock.** The demo profile's date of birth is fixed at server start while the calendar
  is read at request time, so a demo server left running across midnight lets the wrong trip pass.
  Restart it for a new day.
- **Not audited.** A three-week hackathon build.

## Setup

Node.js 24 is pinned with [mise](https://mise.jdx.dev/). Install mise, then run:

```bash
mise trust     # trust this repository's mise.toml
mise install   # install the pinned Node.js
npm install    # install dependencies (this also installs the git hooks)
```

## Run it

The Wave 1 demo video is recorded with every port real: a Google Calendar, the NeonDB catalog and
profile, Gemini as the planner, and a Midnight devnet for both the payments and the age proof. Nothing
in it is a stand-in. The same path can be walked on your machine in demo mode, where every port
(calendar, fare catalog, planner, spending allowance, storage, identity) is served by an in-process
fake, so the app runs with nothing else set up.

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

Then open **Tasks** ([http://localhost:3000/ja/tasks](http://localhost:3000/ja/tasks)), press
**カレンダーをスキャン**, and open 大阪出張 (取引先訪問) with **秘書に相談**. From the reply buttons: propose
(the first proposal also sets up a spending allowance), approve, pay, add to the calendar. Back in
**Tasks** the trip moves from 手配中の出張 to 確定旅程, and the written-back event no longer shows up
in a scan. This is the same path the demo video walks, on fakes instead of the real systems.

The other seeded events each show one more thing:

- 大阪出張 (展示会): an overnight trip, so lodging is added.
- 大阪出張 (取引先と懇親会) and 大阪出張 (パートナー会食): an izakaya (age 20 or over). Approving asks
  whether the secretary may send the age proof. For the first trip the proof fails, and the secretary
  offers to rebuild the plan without the age-limited place; for the second, three days later, it
  passes. The demo profile's date of birth is 20 years before the server's start date plus 7 days.
- 大阪出張 (工場視察と懇親会): every category at once (lodging, the izakaya, a leisure place), five
  bookings, each with its own "keep private" switch.
- チーム定例: the secretary declining an event that is not a trip.

The ledger panel beside the conversation counts each payment on the public side while the cap and
the spent amount stay private. Everything lives in memory, so restarting the server starts over. The
dev sign-in trusts whoever clicks the button, so it only starts when `NEXTAUTH_URL` points at
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

### With a Midnight devnet (real payments)

Needs Docker and the Compact compiler at 0.31.1: install the `compact` CLI with the
[installer](https://github.com/LFDT-Minokawa/compact#installation) (the script itself is still served
from the `midnightntwrk/compact` releases), then `compact update 0.31.1`; newer compilers are not
used here.

```bash
docker compose -f devnet.yml up -d --wait     # node, indexer, proof-server on 127.0.0.1
cd contract
npm install
npm run compile:full                          # circuits, TypeScript bindings and proving keys
cp .env.example .env                          # DEPLOYER_SEED (openssl rand -hex 32), never committed
npm run address                               # the deployer's unshielded address
npm run fund -- <address> 100000              # genesis NIGHT (devnet only; 1000 was not enough for the DUST step)
npm run register-dust                         # fee DUST, proportional to the registered NIGHT
npm run deploy                                # token.compact: deploy, mintSupply, setSendAllowance
npm run deploy-shielded-token                 # shielded-token.compact
npm run deploy-age-verification               # age-verification.compact
```

Put the three printed addresses into `contract/.env` (`TOKEN_ADDRESS`, `SHIELDED_TOKEN_ADDRESS`,
`AGE_VERIFICATION_ADDRESS`), then start the contract server with `npm run server` in `contract/`
(root's `npm run dev` starts it alongside Next.js). Back at the root:

```bash
SECRETARY_MODE=demo SECRETARY_MANDATE=real \
  MANDATE_SETTLEMENT_RECIPIENT=<an unshielded address> \
  MANDATE_SETTLEMENT_RECIPIENT_SHIELDED=<a shielded address> \
  npm start
```

Each payment takes about 20 seconds (proof generation), so a three-booking trip pays in about a
minute. Add `SECRETARY_IDENTITY=real` for the age proof to go through the contract as well. The
profile page's Connect Wallet button targets the network named by `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID`
(`undeployed`, the default, for this devnet). `docker compose -f devnet.yml down` discards the chain,
so the deployment is redone after it.

### Source variables

| Variable | Values | Default |
| --- | --- | --- |
| `SECRETARY_MODE` | `normal` \| `demo` | `normal` |
| `SECRETARY_AUTH` | `google` \| `dev` | from the mode |
| `SECRETARY_CALENDAR` | `real` \| `fake` | from the mode |
| `SECRETARY_CATALOG` | `real` \| `fake` | from the mode |
| `SECRETARY_PLANNER` | `real` \| `fake` | from the mode |
| `SECRETARY_MANDATE` | `real` \| `fake` | from the mode |
| `SECRETARY_STORE` | `real` \| `fake` | from the mode |
| `SECRETARY_IDENTITY` | `real` \| `fake` | from the mode |
| `SECRETARY_PROFILE` | `real` \| `fake` | from the mode |

Precedence: a per-port variable beats `SECRETARY_MODE`, which beats the `normal` default (everything real).

Each real port reads its own variables (listed in `.env.example`) from `.env.local`; a missing one does
not stop the server but makes that port's calls fail:

| Port | Variable | Read when |
| --- | --- | --- |
| catalog | `DATABASE_URL` | the first catalog query (`unavailable` when missing) |
| planner | `GEMINI_API_KEY`, `GEMINI_MODEL` (optional) | every proposal (`planner.llm` when the key is missing) |
| mandate | `MANDATE_SETTLEMENT_RECIPIENT` | every payment (`unavailable` when missing) |
| profile | `DATABASE_URL` | the age proof reads the date of birth from the profile page's table |
| identity | `AGE_VERIFICATION_ADDRESS` (in `contract/.env`, read by the contract server) | issuing the credential and every age proof (`unavailable` when the contract server has no age verification) |

`SECRETARY_IDENTITY=real` issues the credential and proves the age through the contract server's
`/age-verification/*` routes. What is real there is the circuit, the proof, and the on-chain record:
the date of birth is registered as a commitment on the deployed age-verification contract, and each
proof is a transaction whose id becomes the proof reference. What is not real is who holds the
secrets. The app derives one opaque pseudonym per user and sends it with every call; the contract
server derives that user's identity secret and salt from it, keeps that user's private state under
it, and receives the date of birth from the app over loopback HTTP when the credential is issued. So
the secrets pass through the server rather than staying with the user, and this is a dev stand-in for
the flow where a wallet on the user's side proves without ever sending them anywhere. The cutoff date
is worked out by the app (the departure date minus 20 years) and passed to the prove route as is. The
contract server needs only `AGE_VERIFICATION_ADDRESS` in `contract/.env`; the deployer's wallet pays
the fees for every registrant.

`SECRETARY_STORE=real` writes the confirmed itinerary to NeonDB (`trips` and `trip_items`) once the trip
is on the calendar, and reads the Confirmed tab from there, so it needs `DATABASE_URL`. Trips in progress
(proposed, approved, paid) still live in memory and are lost on restart. Writing needs
`SECRETARY_CATALOG=real` as well, because each line item points at the service row it was booked from and
only the real catalog can look those ids up; with the fake catalog the calendar entry still succeeds and
the conversation says the itinerary could not be saved.

## Tests and CI

```bash
npm test               # vitest: 55 files, 731 tests, about five seconds, no network
npm run typecheck      # next typegen + tsc
npm run lint           # Biome
npm run build
npm run i18n:report    # keys present in en.json but not ja.json, and the reverse
```

The tests need no database, key or node. I/O comes into every function as an argument, so the tests
pass the same fakes that demo mode runs on, and the use cases are exercised end to end (scan, propose,
approve, pay, write back, the age check and the rebuilt plan) as state in, state out. Where they are:

| Directory | Files | What is covered |
| --- | --- | --- |
| `src/domain` | 6 | money, dates, plans, trips, catalog offers, id parsing |
| `src/application` | 3 | the use cases against the fakes, source resolution, wiring |
| `src/adapters` | 17 | the fake ledgers and registries, Gemini prompts and response parsing, Google Calendar, Neon row mapping, the real mandate and identity adapters against stubbed contract-server calls |
| `src/server` | 6 | route handlers, request parsing, response envelopes, page loaders |
| `src/components`, `src/features` | 14 | conversation, tasks and settings views, profile and trip features |
| `src/lib`, `src/i18n` | 9 | result, array, brand and schema helpers, the Google token, the request and response schemas, message loading and locale routing |

The circuits have no simulator tests yet; what CI checks is that they compile and that the generated
bindings typecheck.

CI (`.github/workflows/ci.yml`, on every pull request) runs two jobs:

- `check`: `npm ci`, typecheck, lint, tests.
- `compact`: installs Compact 0.31.1 with `midnightntwrk/setup-compact-action`, compiles every
  contract under `contract/compact` (`--skip-zk`, so circuits and bindings without proving keys), and
  typechecks `contract/src` against the generated bindings. A Compact contract that compiles is the
  entry condition of the buildathon, and this is where it is checked.

Git hooks (lefthook, installed by `npm install`): Biome on commit, typecheck and the changed tests on
push.

Measured on a local devnet run of the demo path with `SECRETARY_MANDATE=real` (2026-09-15): after one
three-booking trip totalling 30,120 MST, the token contract's `sendAllowance` had dropped by exactly
30,120; after a second trip with one booking kept private, `shielded-token`'s mint counter read 1 and
its `mintAllowance` had dropped by that booking's 3,000.

## Wave 1 progress

Done in Wave 1:

- Google Calendar scan of the next 30 days; trips detected and the ones already arranged skipped.
- A conversation per event: proposal (transport, lodging when overnight, dining, leisure) from the
  NeonDB catalog, chosen by Gemini in normal mode, inside the budget and the tastes on the profile.
- A spending allowance the traveler grants once; approval, payment booking by booking, and the
  itinerary written back to the calendar; confirmed itineraries stored in NeonDB.
- Public payments through `token.compact` and private ones through `shielded-token.compact`, both
  verified on a local devnet.
- Profile page (name, dining and leisure tastes, date of birth, and a wallet address read from a
  connected Midnight wallet through the DApp Connector API rather than typed).
- An age credential the traveler issues; consent before every proof; a rebuilt plan when the proof
  fails, with the rows that changed highlighted. With `SECRETARY_IDENTITY=real`, one pseudonym per
  traveler on the deployed contract, and the departure-date cutoff passed from the app to the proof.
- Japanese and English UI.
- Demo mode: every port faked, runs with nothing installed but Node, each page names its stand-ins.
- CI compiling the three Compact contracts at 0.31.1; 731 tests.

## Team

Team Gecko:

- **albaeye** ([shutrax2010](https://github.com/shutrax2010)): the overall design -- the product
  concept and how the parts fit together -- and NeonDB (the catalog, profiles and stored itineraries).
- **kamikaze** ([PhyoeBlitz](https://github.com/PhyoeBlitz)): Midnight -- the Compact contracts, the
  contract server, the devnet.
- **yozora** ([yozora7r](https://github.com/yozora7r)): the AI planner, and Midnight alongside kamikaze.
- **yahomi** ([yahomi-dev](https://github.com/yahomi-dev)): Google Calendar, the screens, QA (tests,
  CI, the port and adapter wiring).

## License

Apache License 2.0. See [LICENSE](LICENSE).
