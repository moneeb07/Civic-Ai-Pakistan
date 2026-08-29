# Stage 2 API Reference

All routes require a valid Better Auth session (`getSession()`); an
unauthenticated request gets `401 { success: false, message: "Please sign in." }`.
Every route that takes a report `id` re-derives ownership from
`(id AND session.user.id)` in one query — a report belonging to someone else
returns `404`, identical to a report that doesn't exist at all. This is
deliberate: it never confirms or denies that a given id belongs to another
citizen.

Every response is `{ success: true, data: ... }` or
`{ success: false, message: string, reason?: string }`.

## `POST /api/reports`
Creates a new draft for the signed-in citizen. Body: none.
→ `data`: the new `ReportDto` (see `src/lib/report/schema.ts`).

## `GET /api/reports`
Lists the citizen's own drafts, newest first.

## `GET /api/reports/[id]`
Returns the report, or `404`.

## `PATCH /api/reports/[id]`
Citizen edits. Body (all optional): `category`, `visionConfirmed`, `title`,
`description`, `severity`, `locationLabel`. Any of `category` / `title` /
`description` / `severity` / `locationLabel` present in the body flips that
field's `*Source` to `"manual"`.

## `POST /api/reports/[id]/image`
`multipart/form-data { image: File }`. Max 10MB. The declared Content-Type is
never trusted — the bytes are sniffed for a real JPEG/PNG/WebP signature
(`sniffImageMimeType`) before anything is written to disk; a mismatch is
`415`. Uploading a new photo clears any prior vision result (`category`,
`visionConfidence`, `visionEvidence`, `visionConfirmed`) since it no longer
describes this image.

## `GET /api/reports/[id]/image`
Streams the stored photo. `404` if none exists or the caller doesn't own the
report.

## `POST /api/reports/[id]/analyze-image`
No body — runs `VisionProvider.analyzeImage` on whatever photo is already
stored. `503` if Gemini isn't configured, `502` on an upstream failure,
`400` if there's no photo yet. On success, returns
`{ report: ReportDto, vision: VisionResult }` — `vision` is what the client
shows as "possible X", never written as a confirmed fact until the citizen
accepts it via `PATCH`.

## `POST /api/reports/[id]/transcript`
Two request shapes, same destination field:
- `multipart/form-data { audio: File }` (webm/ogg/mp4/mpeg/wav, ≤15MB) →
  transcribed via `SpeechToTextProvider`. `422` with `reason: "unclear"` if
  the model wasn't confident — nothing is saved, the citizen is asked to
  retry or type instead.
- `application/json { text: string }` → saved verbatim as the citizen's own
  words, `transcriptSource: "manual"`, no AI call. Also how a citizen
  corrects an AI transcript after reviewing it.

## `POST /api/reports/[id]/location`
Body is one of:
```json
{ "mode": "gps", "latitude": 33.68, "longitude": 73.05, "accuracyMeters": 12 }
{ "mode": "manual", "label": "G-10, Islamabad" }
```
For `gps`, the server reverse-geocodes via `GeocodingProvider` (Nominatim).
If that lookup fails, the raw coordinates are still saved and `locationLabel`
stays `null` — never a fabricated address — and the client falls back to
showing coordinates or asking the citizen to type a location.

## `POST /api/reports/[id]/generate`
No body. Requires `category` and `transcript` to already be set (`400`
otherwise). Calls `ComplaintGenerationProvider` with the category, vision
evidence, the citizen's own description, and the location label; writes
`title` / `description` / `severity` (all `source: "ai"`) and sets
`status: "ready_for_review"`. On any failure, nothing is written — the
existing draft (photo, transcript, category, location) is untouched, exactly
so the citizen never loses what they already provided.

## `POST /api/reports/[id]/confirm`
No body. Validates the report actually has a photo, a category, a
description and a location; `400` with `reason: "incomplete"` and a `missing`
array otherwise. On success, sets `status: "ready_for_submission"` — the only
place in the codebase that status is ever set, and the only thing this call
does. No external system is contacted.
