# 🇵🇰 CivicAI Pakistan

**Your Voice. Your City. Your Right to Be Heard.**

![CivicAI Pakistan — one vision, two platforms: a web app and a mobile app for reporting civic issues](docs/images/civicai-overview.jpeg)

---

## Why we built this

In most Pakistani cities, reporting a broken streetlight means finding the
right office, knowing which department owns the problem, filling in a form in
English, and then never hearing anything again. The people most affected by
civic neglect are usually the people least equipped to navigate that: someone
who reads little English, or reads nothing at all, has no way in.

So we removed the form.

**A citizen takes a photograph. That is the whole first step.** The AI looks at
the picture, says what it sees, and **reads it back to them in Urdu** — then
asks, plainly, "is this right?" If it is, they carry on. If it isn't, they hold
the microphone and say what the problem really is, in their own words, in their
own language. No typing. No English. No knowing which department to ask for.

Behind that, the complaint is written properly, routed to the department that
genuinely owns it, grouped with everyone else who reported the same pothole so
one street's problem doesn't arrive as forty separate tickets, and tracked
until it is fixed. Every department's response time is public.

**Three steps to report a problem. That is the entire product.**

| | |
|---|---|
| **1. Photograph** | Point the camera at the problem. The AI identifies it. |
| **2. Confirm** | It reads its finding aloud in Urdu. Agree, or correct it by voice. |
| **3. Submit** | It writes the complaint, finds the right department, and tracks it. |

We built it twice over — **a web app and an Android/iOS app** — because a
citizen with a cheap phone and a government officer at a desk need very
different things from the same system, and both have to work.

---

## Testing it in five minutes

Two flows, one after the other. The second only makes sense after the first.

### A. Report a problem, as a citizen

1. Sign in at **`/auth/sign-in`** with `citizen@example.com` / `CivicAI@2026`
   *(or sign up fresh at `/register` to see CNIC scanning too)*
2. Press **Report a Problem** on the dashboard
3. **Photograph anything** — a pothole, a bin, a broken light. A photo on your
   screen works; the model doesn't know the difference
4. Wait for the AI to say what it sees. **Turn your volume up** — it reads the
   finding aloud in Urdu and asks whether it's right
5. Press **Continue** if it's right. If it's wrong, press the **mic** and say
   what the problem actually is, in Urdu or English
6. Add a location, review the complaint the AI wrote, and **Confirm**

### B. Watch it arrive, as an officer

7. Open **`/gov/login`** in a different browser or a private window
8. Sign in as `depthead@cda.gov.pk` / `CivicAI@2026`
9. The report is in the queue — **routed to a department**, grouped with any
   similar reports, waiting for a human decision
10. Assign it to `member@cda.gov.pk`, move it through the workflow stages, and
    watch the citizen's tracking page update

### C. Switch the language

11. Press **اردو** in the header. Registration, the dashboard and the whole
    reporting flow switch to Urdu; the app name and the landing-page headline
    stay in English by design

> **What to look at while you do this:** every value the AI produces is
> editable before it is submitted, and every one is labelled as AI-generated.
> The product never presents a model's guess as a settled fact.

---

## What a reviewer should look at

If you have ten minutes, this is the path that shows the whole idea:

1. **[Quick start](#quick-start)** — five minutes to a running web app. Works
   with no database and no paid API key; see [AI providers](#ai-providers).
2. **Register as a citizen** at `/register`. Turn on **voice guidance** at the
   top. Photograph a CNIC — the AI reads it, and every field it returns stays
   editable, because a model reading a laminated card in poor light will
   sometimes get a digit wrong and the person holding the card will not.
3. **Report an issue** at `/report`. Photograph anything. Listen to the Urdu
   read-back. This is the part the project exists for.
4. **Sign in as an officer** at `/gov/login` (credentials under
   [Test accounts](#test-accounts)) and watch the same report arrive, routed,
   grouped, and waiting for a human decision.
5. **Open `/performance`** — the public accountability page. Rankings use
   Bayesian shrinkage, so a department that closed three easy tickets does not
   outrank one that closed three hundred hard ones.

**Design notes worth knowing before you judge the code:**

- **The AI's reading is never silently discarded.** An earlier version scored
  its own confidence and refused low-scoring reads. It was wrong often enough
  to be worse than useless — citizens were sent back to retake photographs that
  had worked. Now the model reads, the citizen checks against the card in their
  hand, and every field is editable.
- **The Urdu voice is generated server-side.** Browser speech synthesis can
  only use voices the device has installed, and Urdu is installed almost
  nowhere. It fails silently — reports success, plays nothing — so it is the
  fallback, not the mechanism.
- **Three AI providers, one interface.** OpenAI, Gemini and OpenRouter are
  interchangeable through a single gate, chosen by one environment variable, so
  the whole product can be run and compared on any of them.
- **English and Urdu, switchable from the header.** Every instruction, button,
  label and message in the citizen flow is translated. The app name and the
  landing-page headline stay English on purpose — brand identity is not
  instructional copy, and translating it would make the product harder to
  recognise, not easier to use.

---

---

## Contents

- [Why we built this](#why-we-built-this)
- [Testing it in five minutes](#testing-it-in-five-minutes) — **start here**
- [What a reviewer should look at](#what-a-reviewer-should-look-at)
- [Quick start](#quick-start) — web running in 5 minutes
- [Running the mobile app](#running-the-mobile-app)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Configuration reference](#configuration-reference)
- [AI providers](#ai-providers)
- [Test accounts](#test-accounts)
- [Project layout](#project-layout)
- [All commands](#all-commands)
- [Troubleshooting](#troubleshooting)

---

## Quick start

**You need:** Node.js 20 or newer (24 recommended), git, and one AI API key.
No database install, no Android SDK, no Xcode.

```bash
git clone https://github.com/MuhammadSami-04/Civic-Ai-Pakistan.git
cd Civic-Ai-Pakistan

npm install
cp .env.example .env.local
```

Now open `.env.local` and set **two** values:

```bash
# 1. Any random string — generate one with:  openssl rand -base64 32
BETTER_AUTH_SECRET=paste-the-generated-value-here

# 2. One AI key. OpenAI is the fastest and most accurate; see AI providers below.
OPENAI_API_KEY=sk-...
```

Then:

```bash
npm run db:migrate     # creates the database
npm run db:seed        # optional: demo departments + government accounts
npm run dev
```

Open **<http://localhost:3000>**. That's the whole web setup.

> **Where's the database?** Leave `DATABASE_URL` empty and the app runs on an
> embedded PostgreSQL (PGlite) at `./.data/civicai`. Nothing to install. Set
> `DATABASE_URL` to a real PostgreSQL or Supabase connection string when you
> want data that outlives your laptop.

### Verify it works

```bash
npm run check:ai       # is your AI key live? which models answer?
npm test               # 573 tests
```

---

## Running the mobile app

The phone app talks to the **web app's API**, so keep `npm run dev` running.

**Nothing here is hardcoded to any one developer.** The API address is detected
from your machine, and you build against your own Expo account.

### Step 1 — install and configure

```bash
cd mobile
npm install
cp .env.example .env     # optional; see below
```

The API address auto-detects your computer's LAN IP, so **most people can skip
`.env` entirely**. Override it only if auto-detection guesses wrong (VPN,
Docker, several network adapters):

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:3000
```

Find your address with `hostname -I` (Linux), `ipconfig getifaddr en0` (macOS),
or `ipconfig` (Windows).

> Never use `localhost` — on a physical phone that means the *phone's* own
> localhost. Your phone and computer must be on the same Wi-Fi.

### Step 2 — create your own Expo project

The app uses native modules (camera, microphone, GPS) that aren't in Expo Go, so
it needs a custom **dev client**. That's built against an Expo project you own:

```bash
npx eas-cli login       # free account: https://expo.dev/signup
npx eas-cli init        # creates YOUR project, writes the id to .env
```

> You cannot build against someone else's project id. EAS rejects it with
> `Entity not authorized`, which reads like a broken login but is really a
> permissions problem. `eas init` gives you your own.

### Step 3 — build the dev client (once, ~15 min)

```bash
npx eas-cli build --profile development --platform android
```

It builds **in the cloud** — no Android SDK, no Java, no emulator needed. When
it finishes, open the link it prints **on your phone** and install the APK.

You only repeat this when native dependencies change. Ordinary JavaScript
changes hot-reload.

### Step 4 — run it

```bash
npx expo start --dev-client
```

Scan the QR code with the CivicAI dev client you just installed (use the app's
own scanner, not the system camera).

Phone on a different network?

```bash
npx expo start --dev-client --tunnel
```

### iOS

Same, with `--platform ios`. A physical iPhone additionally needs an Apple
Developer account for signing; the simulator does not.

---

## What it does

### For citizens

| | |
|---|---|
| **CNIC sign-up** | Photograph the front and back of your National Identity Card. AI reads the fields; you confirm every one before anything is saved. |
| **Report a problem** | Photo → AI identifies the issue → describe it (voice or text) → pin the location → review → submit. |
| **Urdu voice** | The AI's finding is **spoken aloud in Urdu**, and you can reply by speaking. Built for citizens who can't read English — or can't read. |
| **Track it** | Every report gets a code. Watch it move through the department's real workflow stages. |
| **Answer questions** | Departments can ask you for clarification; you reply in-app. |
| **Public accountability** | League table of which authorities actually resolve things. |

### For government

A four-tier hierarchy, each level seeing exactly what it should:

```
Platform Admin  ──  creates organizations, sees across all of them
    │
    └── Organization Head  ──  creates departments, compares them
            │
            └── Department Head  ──  invites members, assigns work, sets workflow
                    │
                    └── Member  ──  works assigned complaints
```

- **Automatic routing** — an issue is matched to the department that owns that
  category, with the reasoning shown so an officer can disagree with it
- **Issue grouping** — twenty reports of one pothole become one issue with
  twenty reporters, not twenty duplicate tickets
- **Custom workflows** — each department defines its own stages and SLA hours
- **Assignment & escalation** — heads assign members, reopen closed complaints
- **Internal discussion** — private threads per issue, with @mentions
- **Comparative dashboards** — every role sees a ranked table of its own peers

---

## How it works

### The report pipeline

```
 photo ──▶ [ AI vision ]  what is this? + one Urdu sentence
             │
             ├─▶ 🔊 spoken aloud in Urdu; citizen confirms or corrects by voice
             │
 voice ───▶ [ AI speech-to-text ]  Urdu-first transcription
             │
             ▼
        [ AI complaint writer ]  title, description, severity
             │
             ▼
        [ routing ]  category ──▶ department (with rationale)
             │
             ▼
        [ grouping ]  merged with matching nearby reports
             │
             ▼
        department workflow ──▶ assignment ──▶ resolution ──▶ citizen rates it
```

### Honest rankings

Two obvious ways to rank authorities are both misleading:

- **by count** — a huge authority resolving 40% of a vast workload beats a small
  one resolving 95% of its own
- **by rate** — an authority with 2 issues, both closed, sits above one that
  resolved 800 of 1000

So CivicAI uses **Bayesian shrinkage**: each authority's resolution rate is
pulled toward the national average, and the pull weakens as its caseload grows.
Below 10 issues an authority is shown with its real numbers but **not ranked** —
"not enough data yet" is more honest than inventing a position.

See [`src/lib/gov/ranking.ts`](src/lib/gov/ranking.ts).

### AI that can't quietly lie

- Nothing the AI extracts is saved until the citizen has **seen and accepted it**
- Routing shows **why** a department was chosen, so an officer can override it
- Every model reply is validated against a Zod schema — a reply that doesn't fit
  moves to the next model rather than being written to the database
- Every request and response is logged to `logs/ai/` for debugging

---

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16.3 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| Mobile | React Native 0.76 + Expo SDK 52, Expo Router 4 |
| Auth | Better Auth 1.7 (scrypt, httpOnly cookies) |
| Database | PostgreSQL via Drizzle ORM — Supabase in production, PGlite embedded for local dev |
| AI | OpenAI · Google Gemini · OpenRouter — switchable, with per-task fallback chains |
| Camera | React Native Vision Camera 4 (CNIC auto-capture on mobile) |
| Tests | `node:test` — 573 tests, no framework |

---

## Configuration reference

### Web — `.env.local` (copy from [`.env.example`](.env.example))

| Variable | Required | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | **yes** | Session signing. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` in development |
| `DATABASE_URL` | no | Empty = embedded PGlite. Set for PostgreSQL/Supabase |
| `AI_PROVIDER` | no | `openai` \| `gemini` \| `openrouter`. Unset = first key found |
| `OPENAI_API_KEY` | one | |
| `GEMINI_API_KEY` | of | |
| `OPENROUTER_API_KEY` | these | |
| `AI_LOG` | no | `off` disables the AI transcript in `logs/ai/` |
| `EMAIL_ROUTING_ENABLED` | no | `false` prints invite links to the console |

### Mobile — `mobile/.env` (copy from [`mobile/.env.example`](mobile/.env.example))

**All optional.** A fresh clone runs with none of them set.

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | auto-detected LAN IP | Where the phone reaches the API |
| `EXPO_PUBLIC_API_PORT` | `3000` | Port only, if the host is still detected |
| `EAS_PROJECT_ID` | none | Your Expo project. `eas init` writes it |
| `EXPO_OWNER` | none | Your Expo username |

These live in `mobile/.env` (gitignored), **not** in `app.json`, so every
developer has their own and nobody's push overwrites anyone else's.
[`mobile/app.config.js`](mobile/app.config.js) merges them over the shared
`app.json` at build time.

> ⚠️ **`logs/ai/` contains personal data.** The CNIC transcript includes a
> citizen's name, CNIC number, date of birth and address in clear text — it is
> what the model was asked to read. Treat those files like a database dump.
> `logs/` is gitignored. Set `AI_LOG=off` to disable.

---

## AI providers

Every model call — CNIC reading, photo classification, transcription, complaint
writing, Urdu speech — goes through **one gate**
([`src/services/ai/client.ts`](src/services/ai/client.ts)). So the entire
pipeline switches vendor with one line:

```bash
AI_PROVIDER=openai      # gpt-4o → gpt-4o-mini
AI_PROVIDER=gemini      # gemini-3.8-flash → gemini-3.7-flash
AI_PROVIDER=openrouter  # free tier, three models per task
```

The prompts, schemas and validation are **identical** across all three, which is
what makes comparing them meaningful — a difference in output is a difference in
the model, not in the plumbing.

Each task has an ordered **fallback chain**. If a model is rate-limited, busy or
withdrawn, the request walks to the next one. A reply that parses as JSON but
fails the service's own schema counts as a failed rung, not a failed request.

```bash
npm run check:ai              # the active provider
npm run check:ai -- --all     # every provider you have a key for
npm run check:cnic -- front.jpg   # one real CNIC read
```

Measured on the same test card: OpenAI **3.4s**, Gemini 88s, OpenRouter 74s.

**No budget?** `OPENROUTER_API_KEY` with the free tier works end to end — it is
slower and occasionally rate-limited, which is exactly what the fallback chains
are for.

### Urdu voice

- **Speech-to-text** asks for Urdu (`ur`), falling back to Hindi (`hi`), then
  auto-detect. Hindi is the fallback because it's mutually intelligible with
  Urdu in speech — far better than a model that has given up and guessed English.
- **Text-to-speech** is generated server-side, because `speechSynthesis` can
  only use voices the *device* has installed and most desktops have no Urdu
  voice — it then reports success and plays silence. Server audio makes the
  voice a property of the app, not of the device.

---

## Test accounts

**Password for every account below: `CivicAI@2026`**

### Citizen — sign in at `/auth/sign-in`

| Email | Password | What's already there |
|---|---|---|
| `citizen@example.com` | `CivicAI@2026` | 5 reports, 3 grouped issues, 1 unanswered question from a department |

Use this to see the citizen side with real history. To walk the flow from
nothing instead, sign up fresh at **`/register`** — you'll need a CNIC photo.

### Government / officers — sign in at `/gov/login`

| Role | Email | Password | What they can do |
|---|---|---|---|
| Platform admin | `admin@civicai.pk` | `CivicAI@2026` | Sees every organisation; creates new ones |
| Organisation head | `orghead@cda.gov.pk` | `CivicAI@2026` | CDA — creates departments, routes issues, compares them |
| Department head | `depthead@cda.gov.pk` | `CivicAI@2026` | Road & Infrastructure — invites members, assigns work, sets the workflow |
| Member (worker) | `member@cda.gov.pk` | `CivicAI@2026` | Works assigned complaints — **2 mentions waiting** |
| Member (worker) | `bilal@cda.gov.pk` | `CivicAI@2026` | Second worker, for testing reassignment — **1 mention waiting** |

Seeded organisation: **Capital Development Authority**, with three departments
— Road & Infrastructure, Water Management, Municipal Services — each with its
own approval workflow and SLA hours.

There is deliberately **no public sign-up for officers**. Government accounts
exist only by invitation or by seed, which is why the list above is fixed.

### Creating these accounts

```bash
npm run db:migrate   # create the tables
npm run db:seed      # create every account above, plus reports and issues
```

`db:seed` clears previous seed data first, so it is safe to re-run whenever you
want a clean demo.

> These are development credentials for a seeded database. Never point a seeded
> database at real citizens.

---

## Project layout

```
src/
  app/                    Next.js App Router — 38 pages, 49 API routes
    api/                  reports, cnic, gov, citizen, auth, performance
    register/             CNIC sign-up wizard
    report/[id]/          camera → describe → location → review
    dashboard/            citizen home, reports, messages, profile
    gov/                  officer portal — issues, complaints, admin, analytics
  components/             ui/, report/, registration/, gov/, civic/, landing/
  lib/
    gov/                  routing, workflow, ranking, permissions, invites
    report/               schemas, client, store
    cnic/                 CNIC parsing and validation rules
    i18n/                 dictionaries + locale/direction handling
  services/
    ai/                   the provider gate, chains, CNIC extract/validate
    vision/               civic photo classification
    speech/               transcription + Urdu synthesis
    complaint/            complaint writer
    gov/                  ingest — routing and grouping
  db/schema.ts            18 tables + gov/collaboration.ts (9 more)

mobile/
  app.json                shared config — committed
  app.config.js           per-machine overrides from env — committed
  .env                    YOUR machine — gitignored
  app/                    Expo Router — tabs, register/, report/new/, gov screens
  src/                    api client, CNIC auto-capture, screens

scripts/                  migrate, seed, check-ai, check-cnic
tests/                    573 tests
code-dashboard/           architecture visualizer (npm run dashboard)
```

---

## All commands

### Web (repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | 573 tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Demo orgs, departments, officers |
| `npm run check:ai` | Probe the active provider's model chains |
| `npm run check:ai -- --all` | Probe every provider you have a key for |
| `npm run check:cnic -- img.jpg` | Run one real CNIC validation |
| `npm run dashboard` | Architecture visualizer on :4321 |

### Mobile (`cd mobile`)

| Command | What it does |
|---|---|
| `npx eas-cli login` | Sign in to Expo |
| `npx eas-cli init` | Create your own Expo project |
| `npx eas-cli build --profile development --platform android` | Cloud dev-client build |
| `npx expo start --dev-client` | Metro bundler + QR code |
| `npx expo start --dev-client --tunnel` | Same, across different networks |
| `npx expo config --type public` | Show the resolved config |
| `npm run typecheck` | `tsc --noEmit` |

---

## Troubleshooting

**`Entity not authorized: AppEntity[...]` when building**
The `EAS_PROJECT_ID` belongs to someone else's Expo account. Run
`npx eas-cli init` to create your own.

**`Owner of project ... does not match owner specified in the "owner" field`**
`EXPO_OWNER` in `mobile/.env` doesn't match the project owner. Set it to your
Expo username, or remove the line entirely.

**`request to https://api.expo.dev/graphql failed` with an empty reason**
Broken IPv6 on your network — Node races IPv6 against IPv4 and gives up after
250 ms instead of falling back:
```bash
NODE_OPTIONS="--network-family-autoselection-attempt-timeout=2000" npx eas-cli build ...
```
Add that `export` to your shell profile to make it permanent.

**Mobile app loads but every request fails**
Auto-detection picked the wrong network interface. Set
`EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to your real LAN address, confirm
`npm run dev` is running, and check the phone is on the same Wi-Fi.

**"We couldn't check this picture" on CNIC scan**
Run `npm run check:ai`. Usually a missing or exhausted API key. The message is
deliberately vague to citizens — the real reason is in `logs/ai/`.

**`Cannot find native module 'ExponentAV' / 'ExpoLocation'`**
A native dependency was added since your dev client was built. Rebuild it.

**PGlite `Aborted()` or lock errors**
PGlite is single-writer and the dev server holds the lock. Stop `npm run dev`
before running `db:seed` or any script — or move to Supabase.

**No voice on the confirm screen**
Expected where the device has no Urdu voice — the app falls back to
server-generated audio, which needs a working AI provider. Check `npm run check:ai`.

**`expo run:android` fails on the Android SDK**
It builds locally and needs the full toolchain (~10 GB, plus Java 17). Use the
EAS cloud build instead.

---

## Contributing

`mobile/app.json` and `.env.example` files are **shared** — changes there affect
everyone. `mobile/.env` and `.env.local` are **yours** and are gitignored. If
you find yourself wanting to commit a machine-specific value, it belongs in an
env var instead.

Before opening a PR:

```bash
npm run typecheck && npm run lint && npm test
```

---

## License

Not yet licensed for redistribution.
