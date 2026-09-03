# Government portal — the seams

This directory is owned by the government-side agent. The citizen-side agent
owns everything under `src/app/report/`, `src/app/register/`,
`src/app/dashboard/`, `src/components/report/`, `src/components/registration/`,
`src/lib/report/` and `src/services/{vision,speech,geocoding,complaint,gemini}/`.

Two contracts cross that line. **Both are listed here so neither side has to
read the other's code to use them.**

---

## 1. `citizen_notification` — resolution notices (citizen side READS)

When a complaint reaches the terminal stage of its department's workflow, the
gov side writes a row to `citizen_notification` inside the same transaction
that resolves it. **A resolved complaint with no notification row is not a
state this code can produce.**

The gov side cannot add a column to `report` — that table belongs to the
citizen side — so this table is how resolution is announced.

```ts
import { listCitizenNotifications } from "@/lib/gov/citizen-notify";

// Already scoped to the caller's own userId in the WHERE clause.
const notices = await listCitizenNotifications(session.user.id);
```

Each row:

| Column      | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `reportId`  | The citizen's report. Join to `report` for the full complaint |
| `userId`    | The citizen who filed it, read from `report.userId`          |
| `kind`      | `"resolved"` today. A vocabulary, so more kinds can be added |
| `title`     | "Your complaint has been resolved"                           |
| `body`      | One sentence naming the complaint and its location           |
| `readAt`    | `null` until the citizen app marks it read                   |

**What the citizen side still needs to build:** an inbox that renders these,
and a write to set `readAt`. Nothing in this ticket renders them — that UI is
citizen-side work. A complaint can be resolved, reopened and resolved again,
which produces a second notice; that is correct, the citizen genuinely needs
telling twice.

**Deliberately not an email or a push.** The platform has no transactional
email provider configured, and inventing one here would be a delivery promise
the system cannot keep.

---

## 2. `POST /api/gov/reports/[reportId]/rate` — citizen rating (citizen side CALLS)

Lives under `/api/gov` because the gov side owns the `complaint_rating` table
and this agent's ownership rule keeps it out of `/api/citizen`. **It is
authenticated as a citizen, not as an officer** (`getSession()`, not
`getOfficer()`), and is meant to be called from the citizen app. The citizen
side is free to proxy it behind its own path later.

```http
POST /api/gov/reports/<reportId>/rate
Content-Type: application/json

{ "stars": 4, "comment": "Fixed quickly, thank you." }
```

- `stars` — integer 1–5, required.
- `comment` — optional, ≤1000 chars.

Responses follow the same envelope as the citizen API:

| Status | `reason`       | Meaning                                              |
| ------ | -------------- | ---------------------------------------------------- |
| 200    | —              | `{ success: true, data: { rated: true } }`           |
| 401    | `unauthenticated` | No session                                        |
| 404    | `not_found`    | Not this citizen's report, or no such report          |
| 400    | `not_resolved` | The complaint hasn't reached a terminal stage yet     |
| 400    | `already_rated`| One rating per report                                 |
| 422    | `validation_failed` | Stars outside 1–5, or a malformed body           |

Ownership is checked inside the store query (`report.id = ? AND report.userId = ?`),
so rating someone else's complaint is indistinguishable from rating one that
does not exist.

**Rating is optional.** Per the product decision there is **no citizen
verification gate** — the department's terminal stage closes the complaint, and
the citizen is told, not asked. A rating of ≤2 flags the complaint on the dept
head's dashboard as "needs attention"; it never reopens anything automatically.
Only a department head can reopen, and only deliberately.

**What the citizen side still needs to build:** the 5-star widget with a Skip
option on the notification card.

---

## What the gov side reads from the citizen side (read-only, always)

`report` is **read-only** here. A grep for `update(schema.report` or
`insert(schema.report` anywhere under `src/lib/gov/` or `src/app/api/gov/`
must return nothing — that is the invariant.

- **Queue input:** `report.status = 'ready_for_submission'`, the status the
  citizen's own confirm step sets.
- **Columns read:** `id`, `title`, `description`, `category`, `severity`,
  `locationLabel`, `latitude`, `longitude`, `updatedAt`, `userId`. Never CNIC,
  never the citizen's profile.
- **Shared vocabularies:** `CIVIC_CATEGORIES` and `SEVERITIES` are imported
  from `src/lib/report/schema.ts`, never redefined. Adding a category on the
  citizen side needs no gov-side edit.

A complaint becomes government work by gaining a `complaint_assignment` row,
never by having its report mutated.

---

## Shared files this ticket touched

Only these three, all additively — no existing line was edited or reordered:

| File | Change |
| --- | --- |
| `src/db/schema.ts` | 11 tables + a second `import` statement, all appended **below** the existing `schema` export. The gov tables are exported as `govSchema` and are deliberately *not* added to the `schema` object, which belongs to Better Auth's adapter. |
| `src/lib/i18n/dictionaries/en.ts` | One new top-level `gov:` key. |
| `src/proxy.ts` | A new `GOV_PROTECTED_PREFIXES` list, a new `if` block, and `/gov/:path*` added to the matcher. Kept separate from `PROTECTED_PREFIXES` because the redirect target differs — an officer belongs at `/gov/login`, not the citizen sign-in. |

`src/components/ui/` was **not** touched. The toast lives at
`src/components/gov/toast.tsx` instead; if the citizen side ever wants toasts,
promoting it to `ui/` is a two-line import change and one coordinated decision.

---

## Bootstrapping the first administrator

The portal has no public sign-up, which leaves a chicken-and-egg problem: the
first officer cannot be invited because there is nobody to invite them.

```bash
# Stop `next dev` first — the local PGlite database allows one writer.
GOV_ADMIN_EMAIL=admin@civicai.local \
GOV_ADMIN_PASSWORD='choose-a-strong-one' \
npx tsx src/lib/gov/seed-admin.ts
```

Idempotent: an existing officer row is reported and left alone. It lives here
rather than in `scripts/` because `scripts/` is outside this ticket's
ownership boundary.

---

## Role model

| Role | Scope | Can |
| --- | --- | --- |
| `platform_admin` | none | Create organizations, invite org heads, read everything, **advance nothing** |
| `org_head` | one org | Create departments, invite dept heads, route confirmed complaints to a department |
| `dept_head` | one dept | Define the workflow, assign complaints to members, advance any stage, reopen |
| `member` | one dept | See **only what is assigned to them**, advance their own stages |

Enforced in three places, and all three must agree:

1. `src/lib/gov/authorize.ts` — pure permission functions, unit-tested.
2. Every store query carries its org/dept scope **in the SQL `WHERE` clause**,
   never as a post-filter in TypeScript.
3. `officer_role_scope_check` in the database — a `dept_head` with no
   department, or a `platform_admin` scoped to one org, cannot be stored.

Out-of-scope access answers **404, never 403** — a 403 would confirm the row
exists, telling an officer that a complaint id belongs to another department.

---

## Not built in this ticket (deliberately)

Kanban board · AI routing service (the `aiSuggested*` columns are prepared and
stay `null`) · heatmap · clustering · analytics · SMTP delivery (the branch
throws `"SMTP not yet implemented"` — a silent no-op with the flag on would
look exactly like working email) · real-time updates.
