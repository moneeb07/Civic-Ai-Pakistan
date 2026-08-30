/*
 * Demo seed for the Stage 3 authority side.
 *
 *   npx tsx scripts/seed-authority.ts
 *
 * Two things make this a seed rather than a pile of fixtures:
 *
 *   1. It writes the SAME tables production writes, through the same code.
 *      Members are real Better Auth accounts hashed by Better Auth; issues are
 *      not inserted at all — citizen reports are inserted and then run through
 *      the real routing and similarity agents, so the demo data is literally
 *      the output of the pipeline it is demonstrating. If grouping breaks, the
 *      seed shows it.
 *   2. Nothing it creates is hardcoded in a component. The UI reads rows.
 *
 * Everything seeded is fictional. These are not real CDA staff, not real
 * citizens, and not real complaints.
 *
 * Safety: it only ever deletes rows it owns — the Stage 3 tables and users on
 * the demo email domains. A real registration created by hand survives.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, inArray, like, or } from "drizzle-orm";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) process.env[match[1]] ??= match[2];
}

const { db } = await import("@/db");
const { user, account, report } = await import("@/db/schema");
const {
  authority,
  authorityMember,
  civicIssue,
  conversationParticipant,
  department,
  issueConversation,
  issueMessage,
  issueReport,
  issueStatusEvent,
  messageMention,
} = await import("@/db/authority/schema");
const { auth } = await import("@/lib/auth");
const { formatMemberCode } = await import("@/lib/authority/schema");
const { ingestPendingReports } = await import("@/services/authority/ingest");
const data = await import("./seed-authority-data.mjs");

const STAFF_DOMAIN = "cda.demo.civicai.pk";
const CITIZEN_DOMAIN = "citizen.demo.civicai.pk";
/** Printed at the end so a judge can actually sign in and look around. */
const DEMO_PASSWORD = "CivicAI!Demo2026";

function newId(): string {
  return randomBytes(16).toString("base64url");
}

/*
 * Deterministic pseudo-randomness. A seed that shuffles differently on every
 * run makes "the demo looked different yesterday" impossible to debug, so the
 * generator is seeded from a constant.
 *
 * xorshift32 rather than a textbook LCG: the classic `state * 1103515245`
 * exceeds 2^53 in JavaScript and silently loses precision, which stops the
 * output being uniform — it was scattering "duplicate" reports 160m apart and
 * over six days, and the similarity agent was quite right to flag those as
 * uncertain. Every operation here stays inside 32 bits.
 */
let rngState = 20260829 >>> 0;
function random(): number {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 4_294_967_296;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** Metres converted to a rough latitude/longitude offset at Islamabad's latitude. */
function jitter(lat: number, lon: number, metres: number) {
  const angle = random() * Math.PI * 2;
  const distance = random() * metres;
  return {
    latitude: lat + (distance * Math.cos(angle)) / 111_320,
    longitude: lon + (distance * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

// -- Reset ------------------------------------------------------------------

async function reset() {
  // Child rows first; the FKs cascade, but being explicit keeps this readable.
  await db.delete(messageMention);
  await db.delete(issueMessage);
  await db.delete(conversationParticipant);
  await db.delete(issueConversation);
  await db.delete(issueStatusEvent);
  await db.delete(issueReport);
  await db.delete(civicIssue);
  await db.delete(authorityMember);
  await db.delete(department);
  await db.delete(authority);

  /*
   * Demo users are identified purely by their email domain, so a real account
   * someone registered through the citizen flow is never touched.
   */
  const demoUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(or(like(user.email, `%@${STAFF_DOMAIN}`), like(user.email, `%@${CITIZEN_DOMAIN}`)));

  const ids = demoUsers.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(report).where(inArray(report.userId, ids));
    await db.delete(account).where(inArray(account.userId, ids));
    await db.delete(user).where(inArray(user.id, ids));
  }

  console.log(`  cleared ${ids.length} previous demo accounts`);
}

// -- Accounts ---------------------------------------------------------------

const passwordHash = await (async () => {
  const ctx = await auth.$context;
  return ctx.password.hash(DEMO_PASSWORD);
})();

/**
 * Creates a sign-in-able account.
 *
 * The password is hashed by Better Auth's own hasher via `auth.$context`, so
 * these are ordinary accounts in the existing auth system — not a parallel
 * login mechanism, and not rows the real sign-in flow would reject.
 */
async function createAccount(name: string, email: string): Promise<string> {
  const userId = newId();
  const now = new Date();

  await db.insert(user).values({
    id: userId, name, email, emailVerified: true, createdAt: now, updatedAt: now,
  });

  /*
   * These three values must match exactly what Better Auth writes for a real
   * email/password sign-up, because its credential lookup keys on them:
   *   accountId  IS the user id, not the email
   *   providerId "credential"
   *   issuer     "local:credential"
   *
   * Getting accountId wrong produces an account row that looks perfectly fine
   * in the database and can never be signed in to — which is exactly what
   * happened the first time.
   */
  await db.insert(account).values({
    id: newId(),
    issuer: "local:credential",
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  return userId;
}

// -- Seed -------------------------------------------------------------------

async function main() {
  console.log("Resetting demo data…");
  await reset();

  // 1-3. Authorities, departments and members ---------------------------
  /*
   * Two authorities, built from the same code path. Which one a report
   * reaches is decided later, by the routing agent, from the categories these
   * departments declare — nothing here assigns reports to an authority.
   */
  const departmentIds: Record<string, string> = {};
  const members: Record<string, { id: string; name: string; code: string }[]> = {};

  const blueprint = [
    {
      authority: data.DEMO_AUTHORITY,
      departments: data.DEMO_DEPARTMENTS,
      admins: data.ADMIN_NAMES,
      staff: {
        "water-management": data.WATER_NAMES,
        "road-infrastructure": data.ROAD_NAMES,
        "municipal-services": data.MUNICIPAL_NAMES,
      } as Record<string, string[]>,
    },
    {
      authority: data.SECOND_AUTHORITY,
      departments: data.SECOND_DEPARTMENTS,
      admins: data.SECOND_ADMIN_NAMES,
      staff: {
        "parks-amenities": data.PARKS_NAMES,
        "emergency-response": data.EMERGENCY_NAMES,
      } as Record<string, string[]>,
    },
  ];

  let firstAuthorityId = "";
  let totalMembers = 0;
  let totalAdmins = 0;

  for (const plan of blueprint) {
    const authorityId = newId();
    await db.insert(authority).values({ id: authorityId, ...plan.authority });
    if (!firstAuthorityId) firstAuthorityId = authorityId;

    for (const dept of plan.departments) {
      const id = newId();
      departmentIds[dept.slug] = id;
      members[dept.slug] = [];
      await db.insert(department).values({
        id,
        authorityId,
        name: dept.name,
        slug: dept.slug,
        description: dept.description,
        categories: JSON.stringify(dept.categories),
      });
    }

    // Member codes are per-authority, so each body numbers its own people.
    let memberSequence = 0;
    const adminKey = `${plan.authority.code}-admin`;
    members[adminKey] = [];

    async function addMember(name: string, group: string, departmentId: string | null) {
      memberSequence += 1;
      const email = `${slugify(name)}@${STAFF_DOMAIN}`;
      const userId = await createAccount(name, email);
      const memberId = newId();
      const memberCode = formatMemberCode(plan.authority.code, memberSequence);

      await db.insert(authorityMember).values({
        id: memberId,
        userId,
        authorityId,
        departmentId,
        memberCode,
        accessType: departmentId ? "department_member" : "authority_admin",
        displayName: name,
      });

      members[group].push({ id: memberId, name, code: memberCode });
      totalMembers += 1;
      if (!departmentId) totalAdmins += 1;
    }

    for (const name of plan.admins) await addMember(name, adminKey, null);
    for (const [slug, names] of Object.entries(plan.staff)) {
      for (const name of names) await addMember(name, slug, departmentIds[slug]);
    }

    await db
      .update(authority)
      .set({ memberSequence })
      .where(eq(authority.id, authorityId));

    console.log(
      `${plan.authority.name}: ${plan.departments.length} departments, ${plan.admins.length} admins`,
    );
  }

  console.log(`Members: ${totalMembers} (${totalAdmins} admins across 2 authorities)`);

  // 4. Citizens ---------------------------------------------------------
  const citizenIds: string[] = [];
  for (const name of data.CITIZEN_NAMES) {
    citizenIds.push(await createAccount(name, `${slugify(name)}@${CITIZEN_DOMAIN}`));
  }
  console.log(`Demo citizens: ${citizenIds.length}`);

  // 5. Citizen reports --------------------------------------------------
  /*
   * Reports only. No issues are written here on purpose: they are produced in
   * step 6 by the real pipeline, so what the demo shows is genuinely what the
   * routing and similarity agents did with this input.
   */
  const now = Date.now();
  let reportCount = 0;

  for (const cluster of data.DEMO_CLUSTERS) {
    const clusterStart = now - cluster.daysAgo * 24 * 3_600_000;

    for (let i = 0; i < cluster.reports; i++) {
      /*
       * Same problem, so: a tight radius, and reports trickling in over a
       * couple of days rather than a fortnight. Both matter — these are the
       * signals the similarity agent actually weighs, and a cluster spread
       * too thinly in space or time is genuinely NOT one issue.
       */
      const point = jitter(cluster.latitude, cluster.longitude, 28);
      const createdAt = new Date(clusterStart + i * (random() * 2.5 + 0.5) * 3_600_000);

      await db.insert(report).values({
        id: newId(),
        userId: pick(citizenIds),
        status: "ready_for_submission",
        category: cluster.category,
        categorySource: "ai",
        visionConfidence: 0.7 + random() * 0.28,
        visionConfirmed: true,
        transcript: cluster.variants[i % cluster.variants.length],
        transcriptLanguage: "English",
        transcriptSource: "voice",
        latitude: point.latitude,
        longitude: point.longitude,
        locationAccuracyMeters: 8 + random() * 20,
        locationLabel: cluster.locationLabel,
        locationSource: "gps",
        title: cluster.title,
        titleSource: "ai",
        description: `${cluster.description} ${cluster.variants[i % cluster.variants.length]}`,
        descriptionSource: "ai",
        severity: cluster.severity,
        severitySource: "ai",
        createdAt,
        updatedAt: createdAt,
      });
      reportCount += 1;
    }

    /*
     * Near misses: same category, ~200m away, deliberately vague wording.
     * These are the reports that should land in `needs_review` rather than
     * being grouped or discarded — the case the three-way decision exists for.
     */
    for (let i = 0; i < (cluster.nearMisses ?? 0); i++) {
      const point = jitter(cluster.latitude, cluster.longitude, 210);
      /*
       * Interleaved with the cluster rather than appended after it, so these
       * arrive the way an ambiguous report really would — in among the clear
       * ones, not neatly at the end.
       */
      const createdAt = new Date(clusterStart + (i + 1) * 9 * 3_600_000);

      await db.insert(report).values({
        id: newId(),
        userId: pick(citizenIds),
        status: "ready_for_submission",
        category: cluster.category,
        categorySource: "ai",
        visionConfidence: 0.55 + random() * 0.2,
        visionConfirmed: true,
        transcript: data.NEAR_MISS_VARIANTS[i % data.NEAR_MISS_VARIANTS.length],
        transcriptLanguage: "English",
        transcriptSource: "voice",
        latitude: point.latitude,
        longitude: point.longitude,
        locationAccuracyMeters: 30 + random() * 40,
        locationLabel: cluster.locationLabel,
        locationSource: "gps",
        title: "Reported problem in the area",
        titleSource: "ai",
        description: data.NEAR_MISS_VARIANTS[i % data.NEAR_MISS_VARIANTS.length],
        descriptionSource: "ai",
        severity: "MEDIUM",
        severitySource: "ai",
        createdAt,
        updatedAt: createdAt,
      });
      reportCount += 1;
    }
  }
  console.log(`Citizen reports: ${reportCount}`);

  // 6. Run the real pipeline -------------------------------------------
  console.log("Running routing + duplicate detection over the reports…");
  const outcomes = await ingestPendingReports(reportCount + 10);
  const created = outcomes.filter((o) => o.created).length;
  const grouped = outcomes.filter((o) => o.matchStatus === "auto_grouped").length;
  const review = outcomes.filter((o) => o.matchStatus === "needs_review").length;
  console.log(
    `  ${outcomes.length} reports processed -> ${created} issues, ${grouped} auto-grouped, ${review} flagged for review`,
  );

  return { departmentIds, members, outcomes };
}

const result = await main();

// Conversations and statuses are layered on in a second module so this file
// stays about the pipeline, not about demo dialogue.
const { seedCollaboration } = await import("./seed-authority-collab.mjs");
await seedCollaboration(result);

console.log("\nDemo sign-in:");
console.log(`  Admin   nadia.sheikh@${STAFF_DOMAIN}`);
console.log(`  Member  ali.raza@${STAFF_DOMAIN}   (Water Management)`);
console.log(`  Member  hassan.tariq@${STAFF_DOMAIN} (Water Management)`);
console.log(`  Password for every demo account: ${DEMO_PASSWORD}`);

/*
 * Closes the database connection before exiting.
 *
 * `process.exit(0)` on its own terminates immediately, skipping any pending
 * I/O the driver hasn't flushed yet. For the embedded PGlite path that used
 * to matter a great deal: an unclosed WASM Postgres instance can leave its
 * data directory in the same state an unclean process kill would — a stale
 * postmaster.pid / lock file at best, genuinely inconsistent pages at worst —
 * so a citizen or judge running `npm run dev` right after a reseed could hit
 * exactly the "worked once, broke on the next run" failure this whole
 * investigation was chasing, without anyone ever having killed anything.
 * migrate.ts already closes its connection for the same reason; this brings
 * the seed script in line with it.
 */
const client = db.$client as { close?: () => Promise<void>; end?: () => Promise<void> };
await (client.close ? client.close() : client.end?.());

process.exit(0);
