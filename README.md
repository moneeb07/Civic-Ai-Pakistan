# 🇵🇰 CivicAI

**Your Voice. Your City. Your Right to Be Heard.**

AI-powered, voice-first civic complaint and accountability platform for Pakistan.

> **Current stage: Stage 1 — Authentication.**
> Sign-up, sign-in, sessions, logout and a protected placeholder home page.
> CNIC scanning, voice assistance, complaint reporting, maps and government
> integrations are **not** part of this stage and are not implemented.

---

## Requirements

- Node.js 20+
- PostgreSQL (optional for local development — see below)

## Getting started

```bash
npm install
cp .env.example .env.local     # then set BETTER_AUTH_SECRET
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>.

Generate a secret with:

```bash
openssl rand -base64 32
```

## Database

CivicAI uses **PostgreSQL** via **Drizzle ORM**, with two interchangeable drivers:

| `DATABASE_URL`  | Driver                       | Use             |
| --------------- | ---------------------------- | --------------- |
| set             | `node-postgres` → PostgreSQL | **Production**  |
| unset           | PGlite → embedded PostgreSQL | Development     |

PGlite is real PostgreSQL compiled to WebAssembly, persisted to `./.data/civicai`.
It runs the same schema and the same migrations as a PostgreSQL server, so nothing
is stubbed or emulated — it simply means you do not need to install a database
server to work on the app. **Production refuses to start without `DATABASE_URL`.**

```bash
npm run db:generate   # generate SQL migrations from src/db/schema.ts
npm run db:migrate    # apply them to whichever database is configured
```

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Development server                   |
| `npm run build`     | Production build                     |
| `npm start`         | Serve the production build           |
| `npm test`          | Validation unit tests                |
| `npm run lint`      | ESLint                               |
| `npm run typecheck` | TypeScript, no emit                  |

## Project structure

```
src/
  app/
    page.tsx                  entry screen
    auth/sign-in|sign-up|forgot-password
    home/                     protected placeholder
    api/auth/[...all]/        Better Auth handler
  components/
    auth/                     shell, card, forms, fields
    brand/                    logo, civic visual
    ui/                       button, input, label
  db/                         Drizzle schema + driver
  lib/
    auth.ts                   Better Auth server config
    auth-client.ts            browser client
    session.ts                server-side session guards
    i18n/                     translation-ready dictionaries
    validation/               shared Zod schemas
  proxy.ts                    optimistic route redirects
```

## Documentation

See [`STAGE_1_IMPLEMENTATION.md`](./STAGE_1_IMPLEMENTATION.md) for the
architecture, security model, test results and extension points.
