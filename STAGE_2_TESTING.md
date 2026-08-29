# Stage 2 Testing

## Automated (`npm test`)

`tests/report-schema.test.ts` and `tests/report-image.test.ts` — 123/123
passing alongside the existing Stage 1 suite. These cover the boundary that
actually matters for an AI feature: **is a malformed or out-of-range model
response rejected, not passed through**.

- Every `visionResultSchema` / `transcriptionResultSchema` /
  `generatedComplaintSchema` case: a category outside the fixed enum, a
  confidence outside 0–1, a severity outside LOW/MEDIUM/HIGH, an
  over-length string — all rejected. This is what "malformed AI response is
  rejected" (acceptance test #14) actually verifies, without needing a live
  Gemini call.
- `locationPayloadSchema` / `describeTextPayloadSchema` / `reportPatchSchema`:
  boundary cases for both request shapes.
- `sniffImageMimeType`: real JPEG/PNG/WebP signatures accepted; a plain text
  file wearing a `.jpg` name and an `image/jpeg` Content-Type header —
  exactly the attack the brief's "never trust the client's declared MIME
  type" rule exists for — rejected.
- `reportImageAbsolutePath`: a normal stored path resolves; a `../../../etc/passwd`
  or absolute-path traversal attempt is refused rather than escaping the
  upload root.

`sniffImageMimeType` and `reportImageAbsolutePath` live in
`report-image-utils.ts`, split out from `report-image.ts` (which does real
filesystem I/O and correctly carries `import "server-only"`) specifically so
these pure, security-relevant functions are importable from a plain
`node:test` run without tripping that guard.

## Manually verified, live, against the real running app

No mocks — real Gemini calls, real Nominatim calls, a real (migrated) local
database, driven through the actual UI via Chrome's
`--use-fake-device-for-media-stream` flag (no physical camera/mic exists in
this environment; see Known Limitations). One full run, screenshotted at each
step:

1. Real account created through the actual registration flow.
2. `/report` → creates a draft, redirects into `/report/[id]/camera`,
   unauthenticated visits redirect to `/auth/sign-in` (confirmed via `curl`).
3. Camera opens, captures, uploads. Photo correctly rejected as `readable: false`
   by the real Gemini vision call when pointed at a synthetic (non-civic)
   test pattern — the honest-uncertainty path, not a crash or a
   false-positive category.
4. Category set (mirroring the app's own manual-choice path) → `/describe` →
   typed description → transcript review screen → "Correct" → `/location`.
5. Real device geolocation (Chrome's override) → real Nominatim reverse
   geocode → "Srinagar Highway, Zone 1, Islamabad Capital Territory, 44080,
   Pakistan" for the coordinates set.
6. `/review` → real Gemini complaint generation → grounded, non-hallucinated
   title/description/severity (see the exact output in `STAGE_2_AI.md`) →
   AI-generated badges rendered correctly → "Confirm Report" →
   `status: "ready_for_submission"` confirmed via direct API check.
7. Zero uncaught exceptions in the browser console across the entire run.
8. `curl` checks: unauthenticated `GET /api/reports/[id]`, unauthenticated
   `POST /api/reports`, and an unauthenticated page visit to `/report` all
   correctly rejected (`401` / `401` / redirect to sign-in).

## Not tested (disclosed, not hidden)

- **Real camera/microphone/GPS hardware.** This sandbox has none. Chrome's
  fake-media-device flags exercise the real code paths (permission states,
  `MediaRecorder`, `getUserMedia`, `navigator.geolocation`) but can't stand
  in for a real phone's actual photo/audio/location quality. Same disclosed
  limitation as the Stage 1 CNIC camera work.
- **Ownership enforcement's positive case** (citizen A actually being served
  citizen B's report) wasn't exercised with two real logged-in accounts in
  the same run — only the negative case (no session at all) was checked live.
  The code path is a single `and(eq(id), eq(userId))` query with no
  code path that skips the `userId` half, the same pattern the CNIC/profile
  routes already use.
- **Voice recording → transcription** was exercised via the typed-text path
  in the live run (faster to script reliably); the audio-upload branch of
  `POST /api/reports/[id]/transcript` shares the same validated-schema tests
  as the other three Gemini calls but wasn't driven through a live
  `MediaRecorder` capture in this session.
- **Nominatim rate limits / paid-geocoder swap** — untested by construction;
  noted as a risk in `STAGE_2_ANALYSIS.md`.
