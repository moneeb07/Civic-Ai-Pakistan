# Stage 2 Analysis — Multimodal Civic Complaint Creation

## 1. Existing architecture (confirmed by inspection, not assumed)

CivicAI is a single Next.js 16 (App Router, Turbopack) application — not a
separate mobile/web/backend split. There is no Expo and no FastAPI anywhere in
this repository; the brief's phrasing anticipated that split but this project
is one full-stack TypeScript app. **Stage 2 is built inside this same app**,
following the conventions already established for Stage 1, not a new service.

| Layer | Technology | Where |
|---|---|---|
| Frontend | Next.js App Router, React 19, Tailwind v4 | `src/app`, `src/components` |
| Auth | Better Auth 1.7.2, session cookie | `src/lib/auth.ts`, `src/lib/session.ts` |
| DB | PostgreSQL via Drizzle ORM (real server in prod, embedded PGlite in dev) | `src/db` |
| AI | Google Gemini (`@google/genai`), used today only for CNIC OCR | `src/services/gemini/cnic-extractor.ts` |
| Validation | Zod, both client and server | `src/lib/*/schema.ts` |
| i18n | A single `Dictionary` object (`src/lib/i18n`), no runtime translation | `src/lib/i18n/dictionaries/en.ts` |

Citizen UI = this same Next.js app, rendered responsively; there is no
separate native app to configure permissions for. Camera/mic/location come
from **browser APIs** (`getUserMedia`, `MediaRecorder`, `navigator.geolocation`),
which is why the brief's Expo/FastAPI-specific guidance (CameraView, Pydantic,
UploadFile) doesn't apply verbatim — the underlying *principles* (explicit
permission UX, no invented APIs, secure-context requirements) do, and are
followed via the Web equivalents.

## 2. Where things live today

- **Auth/session**: `requireSession()` in `src/lib/session.ts` — server-side,
  database-verified, redirects to `/auth/sign-in` when absent. This is the
  authority Stage 2 report ownership is built on.
- **The CNIC pipeline** (`src/services/gemini/cnic-extractor.ts`,
  `src/lib/cnic-confidence.ts`, `src/app/api/cnic/extract/route.ts`) is the
  house style for *any* AI extraction step in this app: server-only Gemini
  call → Zod-validated structured output → a confidence gate that drops
  (never guesses) anything the model wasn't sure of → the client shows only
  what passed. Stage 2's vision, speech and complaint-generation providers
  follow this same shape.
- **Camera capture** (`src/components/registration/cnic-capture.tsx`) is
  deliberately specific to photographing a rectangular ID document (a guide
  overlay, tilt/coverage heuristics). The brief is explicit that civic-issue
  photography must **not** force a document-shaped frame — so Stage 2 gets its
  own, much simpler camera component (open camera → shutter → retake/use),
  not a reuse of this one.
- **Voice already exists in this app, but it is not what Stage 2 needs.**
  `VoiceAssistBar` / `useVoiceGuidance` (`src/components/assisted/`) is
  text-to-speech only — it reads instructions aloud for accessibility. There
  is no speech-to-text anywhere in the codebase. Stage 2's voice complaint
  input (microphone → transcript) is genuinely new and must not be confused
  with, or built on top of, the assisted-mode system.
- **File storage**: `src/lib/profile-image.ts` is the established pattern —
  files live under `.data/uploads/<kind>/`, outside `/public`, served only
  through an authenticated route (`/api/profile/image`). Report photos follow
  the same pattern.
- **Scratch-session pattern**: `src/lib/registration/session.ts` is a
  cookie-addressed draft that never touches a permanent table until
  confirmed. Report drafts are conceptually similar but differ in one
  important way: a report's owner is already an authenticated citizen (unlike
  registration, which precedes having an account), so a `report` row keyed by
  `user_id` and referenced by its own id in the URL is simpler and more
  RESTful than a second cookie-session mechanism.
- **Image compression** (`src/lib/image.ts`) already has the exact browser-side
  resize/compress pattern report photos need; reused directly.

## 3. What Stage 2 actually requires that doesn't exist yet

- `report` table (no `report`/complaint table exists at all).
- Four server-only AI/geo provider modules: vision, speech-to-text,
  reverse-geocoding, complaint generation.
- ~9 API routes under `/api/reports`.
- A camera component, a voice recorder component, a location step, and a
  review/confirm screen — none exist. (`/dashboard`'s "Report with Camera" /
  "Speak Your Complaint" cards are currently inert placeholders marked
  "Coming soon" — this is the wiring Stage 2 completes.)

## 4. Provider decisions

The brief's env-var template suggests separate `VISION_API_KEY`,
`SPEECH_API_KEY`, `GEOCODING_API_KEY`. Introducing three more paid-API
credentials when one already-configured, already-working provider covers two
of the three would violate the brief's own "do not create unnecessary
variables" rule, so:

- **Vision** → Gemini (multimodal image input), reusing `GEMINI_API_KEY`.
- **Speech-to-text** → Gemini (multimodal audio input), same key. Chosen over
  the browser's native Web Speech API because Web Speech's language coverage
  for Urdu/Punjabi/Pashto/Sindhi/Balochi/Saraiki is inconsistent across
  browsers, and the "preserve the original transcript, never invent a
  translation" rule needs a model that actually understands what it heard,
  not a browser's built-in recognizer.
- **Complaint generation** → Gemini, same key, third structured-output call
  following the CNIC extractor's schema-and-confidence discipline.
- **Reverse geocoding** → OpenStreetMap Nominatim. No API key required for
  this call volume (one lookup per report, called server-side with a proper
  User-Agent per Nominatim's usage policy). If a paid provider is ever
  needed, `GeocodingProvider` is a real interface, not a hard-coded call, so
  swapping it in is a new implementation, not a rewrite.

No `AI_MODE=demo` is being built: Gemini is already configured and working
for this account (proven by the CNIC pipeline), so there is a real provider
to call. A demo mode over a working provider would be extra surface with no
purpose.

## 5. Data minimization

`report` intentionally does not reference `user_profile` and carries no CNIC,
no address-book fields, no password. It only holds `user_id` plus the
complaint itself. Exact location is stored (needed to route a real civic
issue) but never rendered to any audience beyond the owning citizen in this
stage — there is no public map, no cross-citizen visibility, matching "no
public accountability yet."

## 6. Reused vs. new

| Reused as-is | Adapted | New |
|---|---|---|
| `requireSession`, Better Auth | File-storage pattern (`profile-image.ts` → `report-image.ts`) | `report` DB table + migration |
| Zod dual-validation convention | Browser image compression (`prepareCnicImage` → a report variant) | 4 provider modules |
| Gemini structured-output + confidence-gate pattern | `RegistrationShell`/`StepHeading` visual language → `ReportShell` | Camera, voice-recorder, location, review components |
| `i18n` dictionary convention | — | `/api/reports/*` routes, `/report/*` pages |

## 7. Risks

- **PGlite + concurrent processes**: this dev environment's embedded database
  has corrupted more than once this session when a second process opened the
  same data directory while the dev server held it. The new migration is
  applied with the server stopped, not alongside it.
- **No real device in this sandbox**: camera, microphone and GPS cannot be
  exercised with real hardware here. Mechanical/state-machine correctness is
  verified with Chrome's fake-media-device flags where useful; real-world
  verification is the citizen's, same limitation already disclosed for the
  CNIC camera work.
- **Nominatim rate limits**: fine for demo/dev traffic (one request per
  report, on-demand); would need a paid geocoder behind the same interface
  before any real production volume.
- **Gemini quota**: three real calls per completed report (vision, speech,
  generation) plus the existing CNIC calls share one API key/quota.

## 8. Implementation sequence

Following the brief's phase order, collapsed to what's substantive:
schema/migration → provider modules → API routes → camera → vision
confirmation → voice/text input → location → complaint generation → review/
confirm → dashboard wiring → tests → docs.
