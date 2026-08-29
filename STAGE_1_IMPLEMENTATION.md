# CivicAI — Stage 1 Implementation Report

**Scope: authentication only.** Sign-up, sign-in, session management, logout,
protected routing, and a placeholder authenticated home page.

---

## 1. Starting point

The project directory was empty apart from a partial, interrupted
`create-next-app` scaffold in `civicai-tmp/` with no `node_modules`. There was
**no existing Better Auth installation, no database, and no authentication code**
of any kind. The scaffold was flattened into the project root and kept
(Next.js 16.3.3, React 19.2.8, TypeScript, Tailwind v4, App Router, `src/`,
`@/*` alias) rather than regenerated, so nothing was needlessly rewritten.

## 2. Technology stack

| Concern     | Choice                        | Note                                             |
| ----------- | ----------------------------- | ------------------------------------------------ |
| Framework   | Next.js 16.3.3 (App Router)   | From the existing scaffold                       |
| Language    | TypeScript (strict)           | From the existing scaffold                       |
| Styling     | Tailwind CSS v4               | Design tokens via `@theme`                       |
| Auth        | Better Auth 1.7.2             | Email + password                                 |
| Database    | PostgreSQL                    | Two drivers, one schema — see §4                 |
| ORM         | Drizzle ORM 0.45.2            | Migrations via drizzle-kit 0.31.10               |
| Validation  | Zod 3                         | One schema shared by client and server           |
| Forms       | React Hook Form 7             | With `@hookform/resolvers`                       |
| Icons       | Lucide React                  |                                                  |
| UI          | shadcn-style primitives       | cva + Radix (`Slot`, `Label`) + `tailwind-merge`  |

Dependency versions were resolved against Better Auth's actual peer ranges
(`drizzle-orm ^0.45.2`, `drizzle-kit >=0.31.4`), and every Better Auth API used
was verified against the installed package's type definitions rather than
assumed.

**UI components** follow shadcn/ui conventions and dependencies exactly, but are
written directly into `src/components/ui/` rather than pulled through the CLI.
This avoided an interactive generator step and kept full control of the visual
treatment; the component API is unchanged, so the CLI can still be adopted later.

## 3. Architecture

```
Browser
  ├── /                       entry screen        (redirects to /home if signed in)
  ├── /auth/sign-in           sign-in form
  ├── /auth/sign-up           sign-up form
  ├── /auth/forgot-password   honest placeholder
  └── /home                   protected placeholder
        │
        ▼
  proxy.ts ............ optimistic redirect on session-cookie presence
        │
        ▼
  lib/session.ts ...... authoritative session check (DB-verified)
        │
  /api/auth/[...all] .. Better Auth handler
        │
  lib/auth.ts ......... betterAuth() + drizzleAdapter + nextCookies()
        │
  db/ ................. Drizzle → PostgreSQL
```

### Two-layer route protection

`proxy.ts` (Next.js 16's replacement for `middleware.ts`) only checks whether a
session **cookie is present**. It cannot validate one, so it is treated purely as
a UX optimisation that avoids a page flash.

The authoritative guard is `requireSession()` in `src/lib/session.ts`, which every
protected page calls and which verifies the session against the database. A forged
cookie passes the proxy layer and is then rejected — this was tested explicitly
(§7, test L).

## 4. Database

Authentication entities only. Four tables, matching Better Auth's schema exactly:

| Table          | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `user`         | Identity: name, email, emailVerified, image, timestamps |
| `account`      | Credentials: `issuer`, `providerId`, hashed `password` |
| `session`      | Active sessions: token, expiry, IP, user agent       |
| `verification` | Verification tokens (unused in Stage 1)              |

The schema was validated against `getAuthTables()` from the installed Better Auth
package. That check caught two real defects in a hand-written first draft: a
missing required `account.issuer` column, and `verification` timestamps that were
nullable when Better Auth requires them.

**Credentials are separated from identity by design** — password hashes live in
`account`, never on `user`. CivicAI profile data (CNIC, address, language
preference, accessibility mode) is deliberately **not** modelled yet; it belongs
to a later stage and will live in its own table keyed by `user.id`.

### Driver strategy

PostgreSQL, reached two ways from one schema:

- **`DATABASE_URL` set** → `node-postgres` against a PostgreSQL server. Production.
- **`DATABASE_URL` unset** → PGlite, PostgreSQL compiled to WASM, persisted to
  `./.data/civicai`. Development only.

PGlite is genuine PostgreSQL and runs the same generated migrations, so the two
paths cannot drift. **Production throws on startup without `DATABASE_URL`.**

The database client is exported through a lazy `Proxy`, because `next build`
imports every route module and would otherwise open a connection at build time.

## 5. Security model

| Control                  | Implementation                                                    |
| ------------------------ | ----------------------------------------------------------------- |
| Password storage         | Better Auth scrypt hashing. Verified: 161-char salted hash, no plaintext substring |
| Password policy          | 8–128 chars, enforced **server-side** by Better Auth and client-side by Zod |
| Session cookies          | `httpOnly`, `sameSite=lax`, `secure` in production                |
| CSRF                     | Better Auth origin validation — cross-origin POST returns 403 (tested) |
| Rate limiting            | Enabled: 20 requests / 60s window, plus Better Auth's per-path limits |
| Account enumeration      | Sign-in collapses every credential failure into one generic message |
| Server-side validation   | Forms use `noValidate`; the server re-validates independently      |
| Secrets                  | Env-only. `BETTER_AUTH_SECRET` required in production; `.env.local` and `.data/` git-ignored |
| Logging                  | No password, token, secret or connection string is ever logged     |
| Third parties            | No analytics, no external AI service, no outbound calls            |

### Deliberate non-implementations

These were **not** faked:

- **Password reset** — no email provider is connected, so `/auth/forgot-password`
  states that plainly instead of showing a form that pretends to send a link.
- **Email verification** — `requireEmailVerification: false`, for the same reason.
  The `emailVerified` column exists for when a provider is added.
- **Social sign-in** — not configured, so no social buttons and no divider are rendered.

### Resolved specification conflict

The brief asked for an "Email or phone" sign-in field, but also forbade collecting
a phone number during Stage 1 sign-up. Since no phone number is ever captured,
a phone sign-in path could not work — offering it would be exactly the fake
authentication the brief prohibits. The field is therefore **"Email address"**,
which is consistent with the brief's own validation requirements. Phone sign-in
can be added with Better Auth's `phone-number` plugin once phone capture exists.

## 6. Design

Built from the reference image's visual language rather than copying it: deep
Pakistan green on off-white, ~24px card radius, subtle borders carrying most of
the structure, soft low shadows, generous padding, clear typographic hierarchy.

Design tokens live in one place (`src/app/globals.css`, Tailwind `@theme`):
colours, radii (`field` 14px / `card` 24px / `panel` 28px), shadows, font.
No hex values are hard-coded in components.

- **Desktop** — deep-green brand panel with an abstract civic grid (streets,
  blocks, report markers; no photograph, no robot, no AI sparkle) beside the
  authentication card.
- **Mobile** — recomposed, not scaled: the panel collapses to a compact header so
  the form is reachable without scrolling.
- **Green is an accent**, not a wash: it carries the brand panel, primary buttons
  and links, while forms stay neutral and breathable.

### Accessibility

Labels are always visible and wired via `for`/`id`; hints and errors are linked
with `aria-describedby`; errors use `role="alert"` **with an icon**, so state is
never conveyed by colour alone; focus rings are high-contrast and visible;
touch targets are ≥48px; inputs are 16px to stop iOS zoom-on-focus; the password
toggle is `aria-pressed` and out of the tab order; `prefers-reduced-motion` is
honoured; `<html>` carries `lang` and `dir`.

### Localisation readiness

No copy is hard-coded in components — everything reads from
`src/lib/i18n/dictionaries/en.ts`. The locale list (English, Urdu, Punjabi,
Sindhi, Pashto, Balochi, Saraiki) and RTL direction mapping already exist.
Adding Urdu is a translation task, not a refactor. No routing or negotiation
machinery was built, since only one language exists today.

## 7. Testing

### Automated — `npm test`, 14/14 passing

Sign-up schema (completeness, password match, length, email format, empty name,
email normalisation), sign-in schema (including that the sign-up length policy is
*not* applied at sign-in, so a pre-existing account is not locked out), and
password-strength assessment.

These tests found a genuine bug: Zod validates before transforming, so an email
with a trailing space — routine with mobile autofill — was rejected as malformed.
Fixed by trimming before validation.

### End-to-end — verified against the running server

| # | Test                                          | Result                              |
| - | --------------------------------------------- | ----------------------------------- |
| 1 | Sign-up creates a real user                   | 200, user + session returned        |
| 2 | Session cookie set                            | Yes, `httpOnly`                     |
| 3 | `get-session` with cookie                     | 200, full session                   |
| A | `/home` without session                       | 307 → `/auth/sign-in`               |
| B | `/home` with session                          | 200, renders the real user's data   |
| C | `/auth/sign-in` with session                  | 307 → `/home`                       |
| D | `/` with session                              | 307 → `/home`                       |
| E | Duplicate email sign-up                       | 422 `USER_ALREADY_EXISTS`           |
| F | Sign-in, wrong password                       | 401, generic message                |
| G | Sign-in, correct password                     | 200, session issued                 |
| H | Password below minimum                        | 400 `PASSWORD_TOO_SHORT`            |
| I | Sign-out                                      | 200                                 |
| J | Session after sign-out                        | `null`                              |
| K | `/home` after sign-out                        | 307 → `/auth/sign-in`               |
| L | **Forged session cookie**                     | 307 → `/auth/sign-in` (rejected)    |
| M | **Cross-origin sign-in (CSRF)**               | 403 `INVALID_ORIGIN`                |
| N | Password at rest                              | 161-char hash, no plaintext         |
| O | Uppercase / spaced email sign-in              | 200 (normalised)                    |

`npm run build`, `npx tsc --noEmit` and `npx eslint .` all pass with **zero errors
and zero warnings**.

### Not covered

Client-side error and loading states were verified by construction and by the
server-side equivalents, but not driven through a real browser interaction —
there is no browser-automation harness in the project yet. Adding Playwright is
the natural next step.

## 8. Acceptance criteria

| Criterion                                        | Status |
| ------------------------------------------------ | ------ |
| Application starts successfully                  | ✅ |
| Authentication UI matches the visual direction   | ✅ |
| UI is responsive                                 | ✅ |
| Sign Up works                                    | ✅ |
| Sign In works                                    | ✅ |
| Better Auth genuinely integrated                 | ✅ |
| PostgreSQL connected                             | ✅ (embedded locally; server via `DATABASE_URL`) |
| Sessions work                                    | ✅ |
| Logout works                                     | ✅ |
| Protected `/home` works                          | ✅ |
| Unauthenticated users cannot access `/home`      | ✅ |
| Authenticated users do not see the login page    | ✅ |
| Passwords securely handled                       | ✅ |
| Validation works                                 | ✅ |
| Loading states work                              | ✅ |
| Error states work                                | ✅ |
| Mobile layout works                              | ✅ |
| Desktop layout works                             | ✅ |
| Accessibility basics implemented                 | ✅ |
| No fake authentication                           | ✅ |
| No future CivicAI features leaked in             | ✅ |

## 9. Extension points for later stages

Nothing below is implemented — these are the seams left open.

- **Citizen profile / CNIC** — add a `user_profile` table keyed by `user.id`.
  Credentials stay in `account`; profile data never mixes with them.
- **Phone + OTP** — Better Auth's `phone-number` plugin, once phone capture exists.
- **Email verification & password reset** — flip `requireEmailVerification` and
  add `sendResetPassword` once a transactional email provider is configured.
- **Languages** — add `dictionaries/ur.ts` satisfying the `Dictionary` type and
  resolve the active locale from the user's stored preference; RTL already maps.
- **Accessibility / assisted mode** — will be a stored user preference, applied
  as a layout variant. Note the brief's requirement: never label a person, only a mode.
- **Complaints, maps, routing, government adapters** — separate route groups and
  tables; no Stage 1 code needs to change to accommodate them.

## 10. Environment notes

- `git` is not installed on this machine, so the project is **not yet a Git
  repository**. `.gitignore` is prepared (`.env.local`, `.env*.local`, `.data/`).
  Run `sudo apt install git` then `git init` when convenient.
- No PostgreSQL server, Docker, or passwordless sudo was available, which is why
  the embedded-PostgreSQL development path exists. It is a convenience, not a
  compromise: production still requires a real server.
- A synthetic development account exists in the local `.data/` database
  (`ayesha.demo@civicai.test`). It is git-ignored and unreachable from production,
  which uses a different database entirely.
