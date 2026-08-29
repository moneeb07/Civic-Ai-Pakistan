# Stage 2 AI Providers

Four narrow AI/geo steps, each behind its own interface, each with exactly one
real implementation today. None of them is one giant "figure everything out"
call — the pipeline in `STAGE_2_ARCHITECTURE.md` shows where each one sits and
what it hands to the next.

## Why Gemini for three of the four

The brief's env-var template suggested separate `VISION_API_KEY` and
`SPEECH_API_KEY`. This build reuses the single already-configured
`GEMINI_API_KEY` for vision, speech-to-text, and complaint generation instead —
introducing two more paid credentials for capabilities one working provider
already covers would be the "unnecessary variables" the brief itself warns
against. `GeocodingProvider` is the exception: it calls OpenStreetMap
Nominatim, which needs no key at all at this volume (one lookup per report,
on demand).

Every provider is a real TypeScript interface (`VisionProvider`,
`SpeechToTextProvider`, `GeocodingProvider`, `ComplaintGenerationProvider`), so
a different vendor can be substituted later without any caller changing.

## 1. Vision — `src/services/vision/report-vision.ts`

Input: one photo. Output: `{ detected, category, confidence, evidence, readable }`
(schema in `src/lib/report/schema.ts`), validated against
`CIVIC_CATEGORIES` — the model cannot invent a category outside the fixed
ten-item list.

The prompt is explicit that this is a narrow classification job, not a
judgment: "you are not deciding whether to file a complaint." It's told to
ground `evidence` only in what's literally visible ("depression in the road
surface"), never a cause, duration, or who's responsible, and to set
`readable: false` — which forces `detected: false` regardless of what the
model otherwise claimed — whenever the photo itself is too dark, blurred, or
zoomed to say anything reliable. Verified live: against Chrome's synthetic
fake-camera pattern (a plainly-not-a-civic-photo test image), the model
correctly returned `readable: false` and the citizen was sent back to retake
the photo rather than being given a fabricated category.

## 2. Speech-to-text — `src/services/speech/transcription.ts`

Input: one audio recording. Output: `{ transcript, language, confident }`.

Chosen over the browser's built-in Web Speech API specifically because Web
Speech's coverage of Urdu, Punjabi, Pashto, Sindhi, Balochi and Saraiki is
inconsistent across browsers, and this feature promises to preserve exactly
what was said. The prompt forbids translating or "cleaning up" the speech —
Urdu stays Urdu script, code-switched Urdu/English stays mixed exactly as
spoken — and requires a `null` transcript rather than a guess when the
recording is unclear. The API route treats `confident: false` as a hard
rejection (`422`, nothing saved): the citizen retries or types instead.

## 3. Reverse geocoding — `src/services/geocoding/reverse-geocode.ts`

Input: lat/lng. Output: a human-readable address, or `null`. Nominatim is
called server-side (never from the browser) with a real, policy-compliant
User-Agent and a 6s timeout. A failed or empty lookup returns `null` — never a
guessed city or street — and the caller falls back to raw coordinates or asks
the citizen to type a location. Verified live against real Islamabad
coordinates during manual testing (see `STAGE_2_TESTING.md`).

## 4. Complaint generation — `src/services/complaint/complaint-generator.ts`

Input: the confirmed category, the vision step's evidence phrases, the
citizen's own description (typed or transcribed), and the confirmed location.
Output: `{ title, description, severity }`.

This is the one place in Stage 2 doing real synthesis, so it carries the
longest list of explicit "do not invent" rules in its prompt: no invented
cause, no invented duration, no invented measurements unless the citizen
stated one, no invented count of people or vehicles affected, no invented
road/sector/address beyond what the location step actually confirmed, no
invented injury or accident. Severity is framed to the model — and to the
citizen, via `severityHint` in the UI — as an estimate for review, not an
official priority. Verified live: given a real (fake-GPS) Islamabad
coordinate and the description "Yahan road mein bara gaddha hai aur gariyon
ko mushkil ho rahi hai", it produced "Large pothole on Srinagar Highway in
Islamabad" / "A large pothole on the road is causing difficulty for vehicles.
This issue was reported on Srinagar Highway in Islamabad." / `MEDIUM` — a
faithful English rendering of the citizen's Urdu with no added claims of any
kind, grounded in the actual location Nominatim returned earlier in the same
run.

## The confidence/fact-grounding rule in practice

Every one of these four providers returns *validated, structured* output —
`zod.safeParse` on the way out of Gemini, exactly the same discipline the
CNIC extractor established — and every caller treats a validation failure or
a low-confidence signal as "ask again", never "show it anyway." Nothing an AI
step returns is written to the database as if it were confirmed until either
the citizen has explicitly accepted it (vision category) or the citizen
provided it directly (transcript, location).
