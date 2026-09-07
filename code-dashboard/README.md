# CivicAI · Code Architecture Dashboard

A learning tool for the CivicAI codebase. Not part of the application — it reads
the source and renders what it finds.

```bash
npm run dashboard          # scan, then serve on http://localhost:4321
npm run dashboard:scan     # regenerate architecture.json only
```

## The rule this is built on

**Nothing is invented.** Every file, route, table, export and environment
variable shown was found by reading the actual source. `scan.mts` produces
`architecture.json`; the dashboard renders only that. Change the code, re-scan,
and the dashboard changes with it.

The one curated part is the twelve **workflow stages** — a judgement about what
the system does, in the order a citizen experiences it. Every file path in a
stage is verified against the filesystem, and any that no longer exists is
reported as *missing* rather than quietly dropped. That check has already earned
its place: two paths guessed while writing the stage list did not exist, and the
scanner said so instead of rendering a diagram of an architecture that was not
there.

## Secrets

The scanner **never opens `.env` files**. Environment variables are collected by
NAME from `process.env.X` references in source code, along with the files that
use them. There is no value to leak because no value is ever read. The
dashboard displays `••••••••`.

## What it shows

| Section | Source of truth |
|---|---|
| Overview | 12 stages (curated), each linked to verified files |
| Files & folders | Every `.ts`/`.tsx` under `src/` and `tests/` |
| API endpoints | `src/app/api/**/route.ts` — methods are the handlers actually exported |
| Database | `pgTable(…)` declarations, with real `.references()` foreign keys |
| Environment | `process.env` references, names only |

Click anything to inspect it: exports, imports, what imports it, which routes it
serves, which tables it defines.

**Big picture** explains the system without filenames. **Code flow** shows which
files implement each stage. **Inspect** opens the file tree. Search covers files,
routes, tables, exported symbols and environment variables.

## Known limitation

Imports are extracted with regular expressions rather than the TypeScript
compiler API. That reads every static `import … from "…"` and
`await import("…")` in this codebase correctly, but would miss a dynamically
computed specifier. The compiler API would be exact and considerably slower;
this needs to finish in about a second so re-scanning feels instant.
