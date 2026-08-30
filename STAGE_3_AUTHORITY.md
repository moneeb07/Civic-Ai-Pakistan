# Stage 3 — Authority Management, Issue Intelligence & Collaboration

The receiver side of CivicAI: where citizen reports become organised civic
issues that a government department can actually work on.

Stage 1 (registration/CNIC) and Stage 2 (citizen reporting) are **unchanged**.
No file belonging to either was edited to build this.

---

## The one idea everything else follows from

A **report** is one citizen's account of something.
An **issue** is the real-world problem itself.

```
Citizen A ─┐
Citizen B ─┼──▶ similarity agent ──▶ ONE civic issue   CIV-CDA-000007
Citizen C ─┘                          reports: 26
```

All three reports are preserved, unedited, forever. They are *linked* to an
issue, never merged into one another and never deleted.

---

## Merge safety

Stage 3 lives in its own directories so it can be merged independently:

```
src/db/authority/schema.ts        tables (own file, own export)
src/lib/authority/*               domain rules, all pure where possible
src/services/authority/ingest.ts  the intake pipeline
src/app/authority/**              pages
src/app/api/authority/**          routes
src/components/authority/**       UI
scripts/seed-authority*.mts       demo seed
tests/authority-*.test.ts         tests
```

Exactly three shared files were touched, all trivially:

| File | Change |
|---|---|
| `drizzle.config.ts` | `schema` accepts an array so both schema files are read |
| `drizzle/meta/_journal.json` | generated migration entry |
| `package.json` | one added script, `db:seed:authority` |

`src/db/schema.ts` is **byte-identical** to before. The Stage 3 tables import
`user` and `report` from it for foreign keys, but add nothing to it.

---

## Pipeline

```
confirmed citizen report
        │
        ▼
  routing agent ......... which department declared this category?
        │
        ▼
  similarity agent ...... is this the same problem as an open issue?
        │
   ┌────┴────┐
   ▼         ▼
 link      new issue + CIV-XXX-NNNNNN
```

Run as a **pull** (`POST /api/authority/ingest`, and by the seed), not as a hook
inside the citizen's confirm route. That is what keeps Stage 3 additive: the
Stage 1/2 flow has no idea this exists. In production this is a queue worker;
the trigger differs, the pipeline does not.

### Routing is configuration, not code

`department.categories` is a JSON array of civic categories. It *is* the
routing table. Creating a "Street Lighting" department with
`BROKEN_STREETLIGHT` immediately re-routes those reports — no code change.
Four outcomes: routed / ambiguous (overlapping config, flagged) / catch-all /
**unrouted** (left visibly unassigned rather than dumped somewhere arbitrary).

### Grouping has three outcomes, not two

| Score | Outcome | What happens |
|---|---|---|
| ≥ 0.82 | `auto_grouped` | Attached to the existing issue |
| 0.55–0.82 | `needs_review` | Attached **provisionally**, flagged, splittable |
| < 0.55 | new issue | Opens its own issue |

Signals: location proximity (0.55), wording overlap (0.30), recency (0.15).
Category is a **gate**, not a weight — a garbage report never joins a pothole
issue however close it is. Every verdict carries a plain-language rationale
that is shown on the workspace.

`needs_review` is the point. Rejecting a grouping **unlinks** the report; it is
never deleted, and the next intake pass gives it an issue of its own.

---

## Access model

Two access types, controlling application permissions only:

```
authority_admin     manages departments and members, sees the whole authority
department_member   works the issues of the departments they belong to
```

**There is no hierarchy.** Within a department everyone is a peer: anyone can
open a discussion, post, mention anyone, and change a status. What replaces a
rank system is a record — every status change is appended to an immutable
history with the member's name on it.

Rules live in `src/lib/authority/permissions.ts` — no database, no session, so
they are unit-tested directly. Notable ones:

- Being an admin of one authority is **not** access to another's departments.
- An unrouted issue is admin-only until assigned.
- An admin **cannot** read a private conversation they are not in. Otherwise
  "private" would only mean "private from your colleagues".
- Out-of-scope issues return **404, not 403** — whether an issue exists is
  itself information.

### Private conversations and contextual continuity

`conversation_participant` deliberately has **no "joined at" cursor**. Someone
added to a discussion can read the entire history, because that context is the
reason they were added. Seeded scenario: 6 messages between three members, a
fourth added, who then sees all 10.

### Mentions

Resolved **server-side** against the department roster and stored as rows.
A mention that does not resolve to a real member of that department stays plain
text. This is a security rule: it stops mentions notifying people about work
they cannot open, and stops the endpoint being used to probe who exists
elsewhere. An ambiguous first name (two Ahmeds) resolves to *neither* rather
than guessing.

---

## Demo data

```bash
npm run db:seed:authority
```

Seeds CDA Demo → Water Management / Road & Infrastructure / Municipal Services,
**53 members** (3 admins + 20/15/15), 30 citizens, **108 reports** across 16
clustered problems, then runs the **real pipeline** over them.

The seed inserts **no issues**. Issues, groupings and issue codes are produced
by the actual routing and similarity agents, so the demo is literally the
output of the system it demonstrates — if grouping regresses, the seed shows it.

Latest run: `108 reports → 16 issues, 89 auto-grouped, 3 flagged for review`
(the 3 are deliberate near-misses ~200m away with vague wording).

Also seeds 13 conversations / 73 messages with real mentions, 17 status
changes across all three states, and the contextual-continuity scenario.

Only rows on the demo email domains (`@cda.demo.civicai.pk`,
`@citizen.demo.civicai.pk`) are ever deleted on reset — a real registration
made by hand survives.

**Sign in** (any demo account, password `CivicAI!Demo2026`):

| Role | Email |
|---|---|
| Authority admin | `nadia.sheikh@cda.demo.civicai.pk` |
| Water Management member | `ali.raza@cda.demo.civicai.pk` |
| Water Management member | `hassan.tariq@cda.demo.civicai.pk` |

These are fictional identities, not real CDA personnel.

Then open **`/authority`** — it redirects by access type.

---

## Routes

| Path | Purpose |
|---|---|
| `/authority` | Entry; redirects by access type |
| `/authority/admin` | Authority overview, departments, statistics |
| `/authority/admin/departments/[id]` | Members, issues, add member |
| `/authority/departments/[id]` | Member workspace |
| `/authority/issues` | Search by Issue ID / title / location |
| `/authority/issues/[code]` | The issue workspace |

API under `/api/authority/*`: `ingest`, `departments`, `members`,
`issues/[code]/status`, `issues/[code]/conversations`,
`conversations/[id]/messages`, `conversations/[id]/participants`, `links/[id]`.

---

## Tests

`npm test` — 214 passing, of which 62 are Stage 3:

- `authority-routing` — configuration-driven routing, overlap, unrouted
- `authority-similarity` — the three-way decision, category gate, distance/time limits
- `authority-mentions` — roster-only resolution, ambiguity refusal
- `authority-permissions` — cross-authority isolation, private-thread rules

---

## Honest limits

- **No NADRA and no real authority integration.** Nothing here contacts a real
  government body. "CDA Demo" is seeded data.
- Similarity is heuristic (geo + token overlap + recency), not a trained model,
  and is presented as a confidence with a reason, never as fact.
- Image similarity is **not** implemented; the schema records whether a report
  has a photo, and grouping does not use it.
- Member invitation issues a one-time password shown to the admin once, because
  no transactional email provider is configured. A fake "invitation sent"
  screen would have been dishonest.
- Routing is by declared category across all authorities. Jurisdiction/geography
  matching (two authorities covering the same category in different cities) is
  not implemented — that would need boundary data.

---

# Final integration (Stage 1 ↔ 2 ↔ 3)

The three stages are now one product rather than three that happen to share a
database.

**Citizen report → civic issue.** `/api/reports/[id]/confirm` hands the
confirmed report to `ingestReport`, so a citizen complaint is routed and
duplicate-checked the moment they confirm it. Best-effort by design: the report
is already saved, and if intake is unavailable the report stays unlinked and is
picked up by the next `ingestPendingReports` pass. A citizen is never told
their complaint failed because a downstream agent was down.

**Citizen tracking.** `/dashboard/reports` and `/dashboard/reports/[code]` show
what became of each report — the issue it joined, how many neighbours reported
the same problem, which department holds it, and its progress. Scoped by
`userId` in SQL, and issue detail additionally checks the citizen actually
reported that issue (codes are sequential, so without it the range could be
walked). Citizens see status and timestamps only — no discussions, no member
names, no internal notes.

**One status tracker, both sides.** `components/civic/status-progress.tsx`
renders 🔴 ── 🟠 ── 🟢 on the citizen's report, the citizen issue page and the
authority workspace. The active stage pulses; a resolved issue glows steadily
instead, because a blinking "done" reads as unfinished.

**Two authorities.** The seed now creates CDA **and** MCI, with MCI declaring
`DAMAGED_PUBLIC_INFRASTRUCTURE` and `OTHER` (removed from CDA so nothing is
ambiguous). Routing looks across every authority's departments, so the
department chosen brings its own authority with it — MCI issues get their own
`CIV-MCI-` series. An MCI member cannot reach a CDA issue by editing a URL.

**Public accountability.** `/performance` needs no account. Ranking is
resolution rate smoothed toward the national average by caseload, so a
2-of-2 authority cannot outrank one that resolved 800 of 1000; below
`MIN_ISSUES_TO_RANK` an authority is shown with real figures but explicitly
**not ranked**. The methodology is stated above the table.

**Landing page** now splits citizen and authority entry. Both use the same
authentication — the split is intent, not a second login system.

Tests: **225 passing** (11 new, covering fair ranking and the unranked
threshold).
