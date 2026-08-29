# Stage 2 Setup

No new required environment variables. Stage 2 reuses `GEMINI_API_KEY` (vision,
speech-to-text, complaint generation) and calls Nominatim, which needs no key.
If `GEMINI_API_KEY` is unset, the vision and generation steps fail gracefully
(`503`, "not configured") and the flow falls back to manual category
selection / manual description entry — nothing fakes a result.

## Running it

Same commands as Stage 1 — nothing new to install:

```
npm run dev
```

The new `report` table is already migrated into `./drizzle` (migration
`0004_dizzy_lord_hawal.sql`) and applied to the local PGlite database. A fresh
clone just needs `npm run db:migrate` once, same as before.

## Trying it

1. Sign in (or register — Stage 1).
2. From `/dashboard`, tap "Report with Camera" or "Speak Your Complaint" —
   both lead into `/report`, which creates a draft and opens the camera.
3. Photograph a real civic issue (or use "Choose from Gallery" on
   desktop/without a camera).
4. Confirm or correct the suggested category.
5. Describe it by voice or by typing.
6. Share your location (or type one in).
7. Review the generated report, edit anything, confirm.

## A note on this dev environment specifically

The local PGlite database has corrupted more than once during this session
whenever a second process opened `./.data/civicai` while `next dev` already
held it. If you need to run a one-off script against the database, stop the
dev server first, run the script, then restart — never run one alongside a
live `next dev`.
