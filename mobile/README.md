# CivicAI Pakistan — mobile app

One Expo / React Native app for both sides of CivicAI: citizens who report
problems, and government officers who work on them.

## Why one app and not two

An officer of the water department is also a resident with a broken streetlight
outside their house. Shipping two binaries would mean asking staff to install a
second app to report a pothole. So the app carries both faces and a switch
between them (`src/context/session.tsx`).

The switch is a **view preference, never a permission**. Choosing officer mode
grants nothing — the server decides what each request may see, from the session,
on every request. The switch only appears for accounts that actually have an
officer record, and anyone whose staff access is revoked is moved back to
citizen mode the next time `/api/me` answers.

## Setup

```bash
npm install
npm start           # then press a / i, or scan the QR code with Expo Go
```

Point the app at your API by editing `expo.extra.apiBaseUrl` in `app.json`.

`http://localhost:3000` only works in a simulator on the same machine. On a
**physical phone**, use your computer's LAN address — `http://192.168.1.x:3000`
— and start the web app with `npm run dev` so it listens on that interface.
Android release builds block plaintext HTTP, so anything beyond local
development needs an HTTPS URL.

## How authentication works

The web app rides on Better Auth's httpOnly cookie, which the browser attaches
by itself. React Native's `fetch` has no cookie jar that survives a cold start,
so the app does it explicitly:

1. `signIn` posts to `/api/auth/sign-in/email` and reads `set-cookie`.
2. `takeSessionCookie` (in `src/api/cookie.ts`) keeps only the `name=value`
   pair — `Path`, `HttpOnly` and `SameSite` are browser instructions and would
   make a `Cookie` request header invalid.
3. The cookie goes into the OS keychain via `expo-secure-store`, not
   AsyncStorage: it is as good as a password.
4. Every later request replays it, plus an `Origin` header, because Better Auth
   checks Origin as CSRF protection and a native app has none of its own.

Nothing about the server's authority changes — the phone only carries the same
token a browser would have carried. `takeSessionCookie` is unit tested from the
main repo's suite (`tests/mobile-session-cookie.test.ts`).

## Screens

| Route | Who | What |
| --- | --- | --- |
| `app/sign-in.tsx` | both | One door. Staff accounts are ordinary accounts with an officer record. |
| `app/home.tsx` | both | The role switch, and whichever home matches the current mode. |
| `src/screens/citizen-home.tsx` | citizen | My reports, and a prompt when a department is waiting on an answer. |
| `app/report/[code].tsx` | citizen | Progress, shown as the department's own workflow stages. |
| `app/messages.tsx` | citizen | Answering a department's question. |
| `src/screens/officer-home.tsx` | officer | Department issues, with grouped-report counts, and the inbox badge. |
| `app/issue/[code].tsx` | officer | Grouped reports, routing rationale, discussion threads, questions to reporters. |
| `app/conversation/[id].tsx` | officer | A department thread, with `@` mentions. |
| `app/notifications.tsx` | officer | Mentions and citizen replies, each opening the exact conversation. |

## Endpoints it uses

All of them already exist in the Next.js app and are shared with the web UI, so
the two clients cannot drift into telling people different things:

- `GET /api/me` — identity and whether the role switch is available
- `GET /api/citizen/tracking`, `GET /api/citizen/tracking/[code]`
- `GET|POST /api/citizen/clarifications[/[threadId]/messages]`
- `GET /api/gov/issues`, `GET /api/gov/issues/[code]`
- `GET|POST /api/gov/conversations/[id]/messages`
- `GET|POST /api/gov/clarifications/[threadId]/messages`
- `GET /api/gov/notifications`, `POST /api/gov/notifications/[id]/read`

## Not built yet

- **Reporting from the phone.** The intake pipeline (camera capture, image
  analysis, voice transcript, location) is a multi-step flow that lives in the
  web app; the mobile app currently tracks reports rather than creating them.
- **Push notifications.** The inbox is polled and pull-to-refreshed. Real push
  needs `expo-notifications` plus a device-token table on the server.
- **Offline queue.** A failed send keeps the typed text in the composer, but
  nothing is persisted across an app restart.
