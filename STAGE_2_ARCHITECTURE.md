# Stage 2 Architecture — Civic Complaint Creation

See `STAGE_2_ANALYSIS.md` for the repository audit this was built against. This
document covers what was actually built.

## Report lifecycle

```
draft -> analyzing -> ready_for_review -> ready_for_submission
```

- **draft**: created the instant a citizen taps "Report a Problem". Empty
  except `id` and `userId`.
- **analyzing**: set when a photo has been uploaded and vision analysis has
  run against it (`POST /api/reports/[id]/analyze-image`).
- **ready_for_review**: set once `POST /api/reports/[id]/generate` has
  produced a title, description and severity.
- **ready_for_submission**: set ONLY by the citizen's own
  `POST /api/reports/[id]/confirm`. Nothing else in the codebase can reach
  this status, and nothing reads it to mean "sent to an authority" — no such
  integration exists. This is where Stage 2 ends.

A report is never deleted by this flow; an abandoned draft simply sits at
whatever status it last reached. (No cleanup job exists yet — see Known
Limitations in `STAGE_2_TESTING.md`.)

## Pipeline

```
Camera (report-camera.tsx)
  -> POST /api/reports/[id]/image        (upload, magic-byte validated)
  -> POST /api/reports/[id]/analyze-image (Gemini vision)
       -> "possible <category>" + evidence, confidence
       -> citizen confirms or picks manually (camera-flow.tsx)
Describe (describe-flow.tsx)
  -> voice-recorder.tsx -> POST /api/reports/[id]/transcript (multipart audio, Gemini STT)
     OR typed text -> POST /api/reports/[id]/transcript (JSON)
  -> citizen reviews/corrects the transcript before it's ever used downstream
Location (location-flow.tsx)
  -> browser Geolocation (foreground, on-demand) -> POST /api/reports/[id]/location
     -> server-side Nominatim reverse geocode
     OR manual text entry, no lookup
Review (review-flow.tsx)
  -> POST /api/reports/[id]/generate (Gemini: category + vision evidence +
     citizen's own words + location -> title/description/severity)
  -> every AI field editable, labelled "AI-generated"
  -> POST /api/reports/[id]/confirm -> ready_for_submission
```

Each arrow is a real network call to a real provider — there is no
hard-coded/demo response path, because Gemini is already configured and
working for this account (the CNIC pipeline proves it).

## Component map

| File | Role |
|---|---|
| `src/components/report/report-shell.tsx` | Header, back button, step bar — visual sibling of `RegistrationShell` |
| `src/components/report/report-camera.tsx` | Plain point-and-shoot camera, no document guide |
| `src/components/report/camera-flow.tsx` | Capture → upload → vision → confirm/choose-category phase machine |
| `src/components/report/voice-recorder.tsx` | `MediaRecorder`-based mic capture, idle/listening/processing states |
| `src/components/report/describe-flow.tsx` | Voice-or-type entry, then mandatory transcript review/correction |
| `src/components/report/location-flow.tsx` | GPS-or-manual location, confirm/change |
| `src/components/report/review-flow.tsx` | Generation trigger, every field editable, final confirm |
| `src/lib/report/schema.ts` | Zod schemas + shared TS types — the client/server contract |
| `src/lib/report/store.ts` | All DB access, every read/write scoped to `(id AND userId)` in one query |
| `src/lib/report/client.ts` | Typed fetch wrappers the flow components call |
| `src/lib/report-image.ts` / `report-image-utils.ts` | File storage + byte-signature validation (split so the pure parts are unit-testable — see `STAGE_2_TESTING.md`) |
| `src/services/vision/report-vision.ts` | `VisionProvider` interface + Gemini implementation |
| `src/services/speech/transcription.ts` | `SpeechToTextProvider` interface + Gemini implementation |
| `src/services/geocoding/reverse-geocode.ts` | `GeocodingProvider` interface + Nominatim implementation |
| `src/services/complaint/complaint-generator.ts` | `ComplaintGenerationProvider` interface + Gemini implementation |

## Data minimization

`report` (see `src/db/schema.ts`) carries `user_id` and the complaint itself —
no CNIC, no address-book fields, no password. Every AI-derived column
(`category`, `title`, `description`, `severity`) has a matching `*_source`
column (`"ai" | "manual"`), flipped to `"manual"` by `PATCH /api/reports/[id]`
the instant a citizen edits that field — mirrors the CNIC flow's own rule that
"a field the citizen edits is theirs now, not the model's."

## What Stage 2 deliberately does not do

No government API is called anywhere in this codebase. No public map, no
cross-citizen visibility, no complaint-history dashboard. `ready_for_submission`
is a real status a citizen can reach, and nothing more happens to it — routing
a confirmed report to a real authority is future work.
