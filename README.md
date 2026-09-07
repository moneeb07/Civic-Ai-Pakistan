# 🇵🇰 CivicAI Pakistan

**Your Voice. Your City. Your Right to Be Heard.**

An AI-powered, voice-first civic complaint and accountability platform for
Pakistan — a web app and a companion Android/iOS app sharing one backend.

A citizen photographs a pothole. The AI says what it sees, **reads it back in
Urdu**, and asks if that's right. They describe the rest in their own words —
spoken, in Urdu, if they'd rather not type. The complaint is written, routed to
the department that actually owns it, grouped with everyone else who reported
the same pothole, and tracked to completion. The department's response times
are public.

---

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Running the web app](#running-the-web-app)
- [Running the mobile app](#running-the-mobile-app)
- [Environment variables](#environment-variables)
- [AI providers](#ai-providers)
- [Test accounts](#test-accounts)
- [Project layout](#project-layout)
- [Commands](#commands)
- [Troubleshooting](#troubleshooting)

---

## What it does

### For citizens

| | |
|---|---|
| **CNIC sign-up** | Photograph the front and back of your National Identity Card. AI reads the fields; you confirm every one before anything is saved. |
| **Report a problem** | Photo → AI identifies the issue → describe it (voice or text) → pin the location → review → submit. Four steps, one screen each. |
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
             ├─▶ 🔊 spoken aloud in Urdu, citizen confirms or corrects by voice
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

**Requirements:** Node.js 20+ (24 recommended), and a phone or emulator for the
mobile app.

---

## Running the web app

```bash
git clone git@github.com:MuhammadSami-04/Civic-Ai-Pakistan.git
cd Civic-Ai-Pakistan

npm install
cp .env.example .env.local     # then fill it in — see below
npm run db:migrate
npm run db:seed                # optional: demo orgs, departments, officers
npm run dev
```

Open **<http://localhost:3000>**.

The two variables you cannot skip:

```bash
BETTER_AUTH_SECRET=            # openssl rand -base64 32
OPENAI_API_KEY=                # or GEMINI_API_KEY / OPENROUTER_API_KEY
```

Leave `DATABASE_URL` empty and it uses an embedded PGlite database at
`./.data/civicai` — no PostgreSQL install needed. Set it to a Supabase
connection string for anything shared or persistent.

> **PGlite is single-writer.** The dev server holds the lock. Running
> `db:seed` or any script while `npm run dev` is running will crash one of
> them. Stop the dev server first, or use Supabase.

---

## Running the mobile app

The mobile app talks to the **web app's API**, so the web server must be
running first.

### 1. Point the app at your machine

Find your LAN IP:

```bash
hostname -I | awk '{print $1}'
```

Set it in [`mobile/app.json`](mobile/app.json) → `expo.extra.apiBaseUrl`:

```json
"apiBaseUrl": "http://192.168.1.42:3000"
```

`localhost` will **not** work — that's the phone's own localhost, not your
computer's. Phone and computer must be on the same Wi-Fi.

### 2. Build the dev client (once)

The app uses native modules (camera, microphone, GPS) that aren't in Expo Go, so
it needs a custom dev client. Build it in the cloud — no Android SDK required:

```bash
cd mobile
npx eas-cli build --profile development --platform android
```

Takes ~10–15 minutes. **Install the resulting APK on your phone** when it
finishes — the build alone doesn't update the device.

You need a rebuild only when native dependencies change or the EAS project
changes. Ordinary JavaScript changes hot-reload.

### 3. Run it

```bash
cd mobile
npx expo start --dev-client
```

Scan the QR code with the installed CivicAI dev client (use its own scanner,
not the system camera app).

Not on the same network?

```bash
npx expo start --dev-client --tunnel
```

> `npx expo run:android` builds **locally** and needs the full Android SDK
> (~10 GB), Java 17 specifically, and a connected device. The EAS route above
> avoids all of it.

---

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local`. Everything is documented
inline there; the essentials:

| Variable | Required | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | **yes** | Session signing. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` in development |
| `DATABASE_URL` | no | Empty = embedded PGlite. Set for PostgreSQL/Supabase |
| `AI_PROVIDER` | no | `openai` \| `gemini` \| `openrouter`. Unset = first key found |
| `OPENAI_API_KEY` | one of | |
| `GEMINI_API_KEY` | these | |
| `OPENROUTER_API_KEY` | three | |
| `AI_LOG` | no | `off` disables the AI transcript in `logs/ai/` |
| `EMAIL_ROUTING_ENABLED` | no | `false` prints invite links to the console |

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

Check what's actually alive before a demo:

```bash
npm run check:ai              # the active provider
npm run check:ai -- --all     # every provider you have a key for
npm run check:cnic -- front.jpg   # one real CNIC read
```

Measured on the same synthetic card: OpenAI **3.4s**, Gemini 88s, OpenRouter
74s — which is why `openai` is the recommended default.

### Urdu voice

- **Speech-to-text** asks for Urdu (`ur`), falling back to Hindi (`hi`), then
  auto-detect. Hindi is the fallback because it's mutually intelligible with
  Urdu in speech — far better than a model that has given up and guessed English.
- **Text-to-speech** is generated server-side, because `speechSynthesis` can
  only use voices the *device* has installed and most desktops have no Urdu
  voice — it then reports success and plays silence. Server audio makes the
  voice a property of the app. Browser synthesis remains the fallback for
  providers with no voice of their own.

---

## Test accounts

After `npm run db:seed`, password for **all** accounts is `CivicAI@2026`:

| Role | Email | Can do |
|---|---|---|
| Platform Admin | `admin@civicai.pk` | Create organizations, see all of them |
| Organization Head | `orghead@cda.gov.pk` | Create departments, compare them |
| Department Head | `depthead@cda.gov.pk` | Invite members, assign, set workflow |
| Member | `member@cda.gov.pk` | Work assigned complaints |
| Member | `bilal@cda.gov.pk` | Second member, for assignment testing |

Government staff sign in at **`/gov/login`** — there is deliberately no public
sign-up for officers. Citizens sign up at `/register` with a CNIC.

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
  app/                    Expo Router — tabs, register/, report/new/, gov screens
  src/
    api/                  client, cookie handling, shared types
    cnic/                 vision-camera auto-capture
    screens/              citizen-home, officer-home

scripts/                  migrate, seed, check-ai, check-cnic
tests/                    573 tests
code-dashboard/           architecture visualizer (npm run dashboard)
```

---

## Commands

### Web

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
| `npm run check:cnic -- img.jpg` | Run one real CNIC validation |
| `npm run dashboard` | Architecture visualizer on :4321 |

### Mobile

| Command | What it does |
|---|---|
| `npx expo start --dev-client` | Metro bundler + QR code |
| `npx expo start --dev-client --tunnel` | Same, across different networks |
| `npx eas-cli build --profile development --platform android` | Cloud dev-client build |
| `npm run typecheck` | `tsc --noEmit` |

---

## Troubleshooting

**"We couldn't check this picture" on CNIC scan**
Run `npm run check:ai`. Usually a missing or exhausted API key. The message is
deliberately vague to citizens — the real reason is in `logs/ai/`.

**Mobile app loads but every request fails**
`apiBaseUrl` in `mobile/app.json` doesn't match your machine's current LAN IP,
or the phone is on a different network. Check `hostname -I`, and confirm the web
server is running.

**QR code scans but nothing happens**
The dev client was built against a different EAS project. Rebuild:
`npx eas-cli build --profile development --platform android`.

**`Cannot find native module 'ExponentAV' / 'ExpoLocation'`**
Native dependency added since your dev client was built. Rebuild it.

**PGlite `Aborted()` or lock errors**
Two processes are using the embedded database. Stop `npm run dev` before
running scripts, or move to Supabase.

**No voice on the confirm screen**
Expected on a machine with no Urdu voice installed — the app falls back to
server-generated audio, which needs a working AI provider. Check `npm run check:ai`.

**`expo run:android` fails on the Android SDK**
It needs the full local toolchain. Use the EAS cloud build instead.

---

## License

Not yet licensed for redistribution.
