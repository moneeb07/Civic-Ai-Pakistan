/*
 * Development seed for the merged CivicAI schema.
 *
 * Creates one authority (CDA) with three departments, their workflows, an
 * officer for every role, a citizen with reports, and those reports already
 * grouped into civic issues with a live discussion and notifications — so the
 * gov screens have something real to render the moment you sign in.
 *
 * Two things this script is careful about, both learned the hard way:
 *
 * 1. Accounts are created through `auth.api.signUpEmail`, never by inserting
 *    into `user`/`account` directly. Better Auth keys the credential row on
 *    the USER ID with issuer "local:credential"; a hand-written row that puts
 *    the email there looks perfectly valid in psql and then fails every
 *    sign-in with "User not found".
 *
 * 2. It closes the database pool before exiting. An earlier seed called
 *    process.exit(0) with the connection open and left the database wedged.
 *
 * Safe to re-run: it clears the tables it owns first. It never touches
 * `report` rows it did not create.
 *
 *   npm run db:seed
 */

// MUST be first: ES modules evaluate imports in order, and everything below
// reads DATABASE_URL as it is constructed. See scripts/load-env.mts.
import "./load-env.mts";

import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { govSchema, schema } from "../src/db/schema";
import { collabSchema } from "../src/db/gov/collaboration";
import { auth } from "../src/lib/auth";
import { encryptSensitive, hashSensitive } from "../src/lib/crypto";
import { formatCnic, maskCnic } from "../src/lib/cnic";

/** One password for every seeded account. Development only. */
const PASSWORD = "CivicAI@2026";

const id = (prefix: string, n: number | string) => `seed_${prefix}_${n}`;

/** Creates a Better Auth account and returns its user id. */
async function createUser(name: string, email: string): Promise<string> {
  const result = await auth.api.signUpEmail({
    body: { name, email, password: PASSWORD },
  });

  const userId = result?.user?.id;
  if (!userId) throw new Error(`Could not create account for ${email}`);
  return userId;
}

async function main() {
  console.log("Seeding CivicAI…\n");

  /*
   * Clear in dependency order. `user` cascades into account/session/officer,
   * so removing the seeded users takes their auth rows with them.
   */
  console.log("  clearing previous seed data");
  await db.execute(sql`
    truncate table
      ${collabSchema.officerNotification},
      ${collabSchema.messageMention},
      ${collabSchema.issueMessage},
      ${collabSchema.conversationParticipant},
      ${collabSchema.issueConversation},
      ${collabSchema.clarificationMessage},
      ${collabSchema.clarificationThread},
      ${collabSchema.issueReport},
      ${collabSchema.civicIssue},
      ${govSchema.complaintStageProgress},
      ${govSchema.complaintEvent},
      ${govSchema.complaintAssignment},
      ${govSchema.deptWorkflowStage},
      ${govSchema.deptWorkflow},
      ${govSchema.officerInvite},
      ${govSchema.officer},
      ${govSchema.department},
      ${govSchema.organization},
      ${schema.report},
      ${schema.userProfile},
      ${schema.registrationSession},
      ${schema.session},
      ${schema.account},
      ${schema.verification},
      ${schema.user}
    restart identity cascade
  `);

  // -- Organisation and departments ---------------------------------------
  console.log("  organisation + departments");

  const orgId = id("org", "cda");
  await db.insert(govSchema.organization).values({
    id: orgId,
    name: "Capital Development Authority",
    code: "CDA",
  });

  const departments = [
    {
      id: id("dept", "roads"),
      name: "Road & Infrastructure",
      handlesCategories: ["POTHOLE", "ROAD_DAMAGE", "DAMAGED_FOOTPATH"],
      stages: [
        { name: "Received", sla: 24 },
        { name: "Inspection scheduled", sla: 72 },
        { name: "Repair scheduled", sla: 120, requiresNote: true },
        { name: "Repaired", terminal: true, requiresPhoto: true },
      ],
    },
    {
      id: id("dept", "water"),
      name: "Water Management",
      handlesCategories: ["WATER_LEAKAGE", "DRAINAGE_PROBLEM", "OPEN_MANHOLE"],
      stages: [
        { name: "Received", sla: 12 },
        { name: "Site survey", sla: 48 },
        { name: "Valve isolated", sla: 24, requiresNote: true },
        { name: "Repaired", terminal: true, requiresPhoto: true },
      ],
    },
    {
      id: id("dept", "municipal"),
      name: "Municipal Services",
      handlesCategories: ["GARBAGE", "BROKEN_STREETLIGHT", "DAMAGED_PUBLIC_INFRASTRUCTURE"],
      stages: [
        { name: "Received", sla: 24 },
        { name: "Crew assigned", sla: 48 },
        { name: "Completed", terminal: true, requiresPhoto: true },
      ],
    },
  ];

  for (const dept of departments) {
    await db.insert(govSchema.department).values({
      id: dept.id,
      orgId,
      name: dept.name,
      handlesCategories: dept.handlesCategories,
    });

    const workflowId = id("wf", dept.id);
    await db.insert(govSchema.deptWorkflow).values({ id: workflowId, deptId: dept.id });

    await db.insert(govSchema.deptWorkflowStage).values(
      dept.stages.map((stage, position) => ({
        id: id("stage", `${dept.id}_${position}`),
        workflowId,
        position,
        name: stage.name,
        slaHours: stage.sla ?? null,
        requiresPhoto: stage.terminal === true || stage.requiresPhoto === true,
        requiresNote: stage.requiresNote === true,
        isTerminal: stage.terminal === true,
      })),
    );
  }

  // -- Officers, one per role ---------------------------------------------
  console.log("  officers");

  const roads = departments[0]!;

  const officers = [
    {
      key: "admin",
      name: "Imran Shah",
      email: "admin@civicai.pk",
      role: "platform_admin" as const,
      orgId: null,
      deptId: null,
    },
    {
      key: "orghead",
      name: "Nadia Aslam",
      email: "orghead@cda.gov.pk",
      role: "org_head" as const,
      orgId,
      deptId: null,
    },
    {
      key: "depthead",
      name: "Sara Khan",
      email: "depthead@cda.gov.pk",
      role: "dept_head" as const,
      orgId,
      deptId: roads.id,
    },
    {
      key: "member",
      name: "Ahmed Hassan",
      email: "member@cda.gov.pk",
      role: "member" as const,
      orgId,
      deptId: roads.id,
    },
    {
      key: "member2",
      name: "Bilal Raza",
      email: "bilal@cda.gov.pk",
      role: "member" as const,
      orgId,
      deptId: roads.id,
    },
  ];

  const officerIds: Record<string, string> = {};

  for (const person of officers) {
    const userId = await createUser(person.name, person.email);
    const officerId = id("officer", person.key);

    await db.insert(govSchema.officer).values({
      id: officerId,
      userId,
      role: person.role,
      orgId: person.orgId,
      deptId: person.deptId,
    });

    officerIds[person.key] = officerId;
  }

  // -- A citizen with reports ----------------------------------------------
  console.log("  citizen + reports");

  const citizenUserId = await createUser("Ahmed Nawaz", "citizen@example.com");

  /*
   * The CNIC is stored exactly the way the real registration route stores it:
   * encrypted at rest, hashed for the uniqueness check, and masked for display.
   * Seeding a plaintext number would make this row unlike every row the app
   * actually writes, and the profile screen reads the masked value.
   */
  const citizenCnic = formatCnic("6110144293875");

  await db.insert(schema.userProfile).values({
    id: id("profile", "citizen"),
    userId: citizenUserId,
    fullName: "Ahmed Nawaz",
    fatherName: "Muhammad Nawaz",
    cnicHash: hashSensitive(citizenCnic),
    cnicMasked: maskCnic(citizenCnic),
    cnicEncrypted: encryptSensitive(citizenCnic),
    dateOfBirth: "01.01.1990",
    gender: "Male",
    identitySource: "cnic_scan",
    phone: "+92 300 1234567",
    city: "Islamabad",
    district: "Islamabad",
    sector: "G-11",
    street: "Street 12",
    residentialAddress: "House 123, Street 12, G-11/3, Islamabad",
    permanentAddress: "چک نمبر 47، تحصیل شورکوٹ، ضلع جھنگ",
  });

  const reportSeeds = [
    {
      key: "r1",
      title: "Big hole near the masjid",
      description: "Deep pothole on the service road, right outside the masjid gate.",
      category: "POTHOLE",
      lat: 33.6683,
      lng: 73.0193,
      label: "Service Road West, G-11/3, Islamabad",
    },
    {
      key: "r2",
      title: "سروس روڈ پر گڑھا",
      description: "گاڑی کا ٹائر خراب ہو گیا۔ گڑھا کافی گہرا ہے۔",
      category: "POTHOLE",
      lat: 33.6686,
      lng: 73.0196,
      label: "Service Road West, G-11/3, Islamabad",
    },
    {
      key: "r3",
      title: "Road damaged, car tyre burst",
      description: "The surface has broken up badly over the last month.",
      category: "ROAD_DAMAGE",
      lat: 33.6688,
      lng: 73.0198,
      label: "Service Road West, G-11/3, Islamabad",
    },
    {
      key: "r4",
      title: "Street light out, F-11 Markaz",
      description: "Whole row of lights has been dark for two weeks.",
      category: "BROKEN_STREETLIGHT",
      lat: 33.6845,
      lng: 72.9962,
      label: "F-11 Markaz, Islamabad",
    },
    {
      key: "r5",
      title: "Water main leak, G-11/3",
      description: "Water running down the street continuously since Friday.",
      category: "WATER_LEAKAGE",
      lat: 33.6701,
      lng: 73.0175,
      label: "Street 12, G-11/3, Islamabad",
    },
  ];

  for (const report of reportSeeds) {
    await db.insert(schema.report).values({
      id: id("report", report.key),
      userId: citizenUserId,
      status: "ready_for_submission",
      category: report.category,
      categorySource: "ai",
      visionConfidence: 0.92,
      visionConfirmed: true,
      title: report.title,
      titleSource: "ai",
      description: report.description,
      descriptionSource: "manual",
      severity: "HIGH",
      severitySource: "ai",
      latitude: report.lat,
      longitude: report.lng,
      locationAccuracyMeters: 8,
      locationLabel: report.label,
      locationSource: "gps",
    });
  }

  // -- Issues: three reports grouped into one, two standing alone ----------
  console.log("  civic issues + AI grouping");

  const issues = [
    {
      key: "pothole",
      code: "CIV-CDA-000007",
      title: "Deep pothole, Service Road West",
      description: "Carriageway surface failure outside the masjid gate. Reported by several residents.",
      category: "POTHOLE",
      deptId: roads.id,
      lat: 33.6683,
      lng: 73.0193,
      label: "Service Road West, G-11/3, Islamabad",
      confidence: 0.91,
      rationale:
        "Carriageway surface defect on a CDA-maintained service road. Road & Infrastructure holds surface repair for sector G-11. Water Management was considered and rejected: no standing water or pipe exposure is visible in any of the photographs.",
      reports: [
        { key: "r1", status: "first_report", similarity: null },
        { key: "r2", status: "auto_grouped", similarity: 0.94 },
        { key: "r3", status: "needs_review", similarity: 0.71 },
      ],
      stage: 1, // Inspection scheduled
    },
    {
      key: "light",
      code: "CIV-CDA-000012",
      title: "Street lights out, F-11 Markaz",
      description: "A row of street lights has been unlit for two weeks.",
      category: "BROKEN_STREETLIGHT",
      deptId: departments[2]!.id,
      lat: 33.6845,
      lng: 72.9962,
      label: "F-11 Markaz, Islamabad",
      confidence: 0.88,
      rationale: "Street lighting is maintained by Municipal Services for this sector.",
      reports: [{ key: "r4", status: "first_report", similarity: null }],
      stage: null, // unassigned — sits in the routing inbox
    },
    {
      key: "water",
      code: "CIV-CDA-000003",
      title: "Water main leak, Street 12",
      description: "Continuous flow from a mains joint.",
      category: "WATER_LEAKAGE",
      deptId: departments[1]!.id,
      lat: 33.6701,
      lng: 73.0175,
      label: "Street 12, G-11/3, Islamabad",
      confidence: 0.95,
      rationale: "Mains water escape — Water Management owns supply infrastructure.",
      reports: [{ key: "r5", status: "first_report", similarity: null }],
      stage: 3, // terminal — resolved
    },
  ];

  for (const issue of issues) {
    const issueId = id("issue", issue.key);

    await db.insert(collabSchema.civicIssue).values({
      id: issueId,
      issueCode: issue.code,
      orgId,
      deptId: issue.deptId,
      category: issue.category,
      title: issue.title,
      description: issue.description,
      severity: "HIGH",
      latitude: issue.lat,
      longitude: issue.lng,
      locationLabel: issue.label,
      reportCount: issue.reports.length,
      routingConfidence: issue.confidence,
      routingRationale: issue.rationale,
      routingSource: "ai",
    });

    await db.insert(collabSchema.issueReport).values(
      issue.reports.map((link) => ({
        id: id("link", `${issue.key}_${link.key}`),
        issueId,
        reportId: id("report", link.key),
        matchStatus: link.status,
        similarity: link.similarity,
        matchRationale:
          link.status === "needs_review"
            ? "Same road and same defect type, but 52 m from the first report — plausibly a second pothole."
            : null,
      })),
    );

    // Assign the issue into its department's workflow, where routed.
    if (issue.stage !== null) {
      const stageId = id("stage", `${issue.deptId}_${issue.stage}`);
      const assignmentId = id("assign", issue.key);

      await db.insert(govSchema.complaintAssignment).values({
        id: assignmentId,
        issueId,
        orgId,
        deptId: issue.deptId,
        currentStageId: stageId,
        assignedOfficerId: officerIds.member!,
        aiSuggestedOrgId: orgId,
        aiSuggestedDeptId: issue.deptId,
        aiConfidence: issue.confidence,
        aiReasoning: issue.rationale,
        aiSuggestionSource: "ai",
      });

      /*
       * One progress row per stage entered, so the citizen's timeline has real
       * history rather than only its current position. Earlier stages are
       * closed out; the current one is still open.
       */
      for (let position = 0; position <= issue.stage; position += 1) {
        const enteredAt = new Date(Date.now() - (issue.stage - position + 1) * 86_400_000);
        await db.insert(govSchema.complaintStageProgress).values({
          id: id("prog", `${issue.key}_${position}`),
          assignmentId,
          stageId: id("stage", `${issue.deptId}_${position}`),
          enteredAt,
          completedAt:
            position < issue.stage ? new Date(enteredAt.getTime() + 43_200_000) : null,
          completedByOfficerId: position < issue.stage ? officerIds.member! : null,
          note: position < issue.stage ? "Stage completed." : null,
        });
      }
    }
  }

  /*
   * -- Demo volume ---------------------------------------------------------
   *
   * The three hand-written issues above tell the product's story, but they
   * cannot demonstrate the league tables: with one to three issues each,
   * every organisation, department and member sits below the evidence bar
   * (10 / 5 / 3 in lib/gov/peer-performance.ts) and the whole table reads
   * "not enough data to rank" — which is the honest answer, and a useless
   * demo.
   *
   * So this generates enough routed work for the ranking to actually mean
   * something, with DELIBERATELY uneven outcomes: Ahmed clears most of his
   * queue, Bilal clears less of a smaller one, and the three departments
   * finish at visibly different rates. Nothing here is a real citizen report
   * — these are department-side issues only, which is why they carry a
   * reportCount but no issueReport links.
   */
  console.log("  demo volume for the league tables");

  const demoPlans = [
    // dept index, terminal stage index, count, resolved, assignee key
    { dept: 0, terminal: 3, count: 8, resolved: 6, assignee: "member" },
    { dept: 0, terminal: 3, count: 6, resolved: 2, assignee: "member2" },
    { dept: 1, terminal: 3, count: 8, resolved: 6, assignee: null },
    { dept: 2, terminal: 2, count: 8, resolved: 3, assignee: null },
  ];

  let demoSequence = 100;

  for (const plan of demoPlans) {
    const dept = departments[plan.dept]!;

    for (let n = 0; n < plan.count; n += 1) {
      demoSequence += 1;
      const key = `demo_${demoSequence}`;
      const demoIssueId = id("issue", key);
      const isResolved = n < plan.resolved;
      // Unresolved work is spread across the earlier stages, not parked on one.
      const stage = isResolved ? plan.terminal : n % Math.max(plan.terminal, 1);

      await db.insert(collabSchema.civicIssue).values({
        id: demoIssueId,
        issueCode: `CIV-CDA-${String(demoSequence).padStart(6, "0")}`,
        orgId,
        deptId: dept.id,
        category: dept.handlesCategories[0]!,
        title: `${dept.name} case ${demoSequence}`,
        description: "Seeded so the performance tables have enough history to rank.",
        severity: n % 3 === 0 ? "HIGH" : "MEDIUM",
        latitude: 33.68 + n / 1000,
        longitude: 73.02 + n / 1000,
        locationLabel: `Sector G-${10 + (n % 4)}, Islamabad`,
        reportCount: 1 + (n % 3),
        routingConfidence: 0.9,
        routingRationale: "Category maps to this department's remit.",
        routingSource: "ai",
      });

      const assignmentId = id("assign", key);

      await db.insert(govSchema.complaintAssignment).values({
        id: assignmentId,
        issueId: demoIssueId,
        orgId,
        deptId: dept.id,
        currentStageId: id("stage", `${dept.id}_${stage}`),
        // Null where the department has no members seeded: routed into the
        // workflow, not yet on a person's desk. That is a real state.
        assignedOfficerId: plan.assignee ? officerIds[plan.assignee]! : null,
        aiSuggestedOrgId: orgId,
        aiSuggestedDeptId: dept.id,
        aiConfidence: 0.9,
        aiReasoning: "Category maps to this department's remit.",
        aiSuggestionSource: "ai",
      });

      for (let position = 0; position <= stage; position += 1) {
        const enteredAt = new Date(Date.now() - (stage - position + 1) * 86_400_000);
        await db.insert(govSchema.complaintStageProgress).values({
          id: id("prog", `${key}_${position}`),
          assignmentId,
          stageId: id("stage", `${dept.id}_${position}`),
          enteredAt,
          completedAt: position < stage ? new Date(enteredAt.getTime() + 43_200_000) : null,
          completedByOfficerId:
            position < stage && plan.assignee ? officerIds[plan.assignee]! : null,
          note: position < stage ? "Stage completed." : null,
        });
      }
    }
  }

  // -- A live discussion on the pothole issue ------------------------------
  console.log("  discussion + notifications");

  const issueId = id("issue", "pothole");
  const conversationId = id("conv", "inspection");

  await db.insert(collabSchema.issueConversation).values({
    id: conversationId,
    issueId,
    title: "Site inspection",
    visibility: "department",
    createdByOfficerId: officerIds.depthead!,
  });

  await db.insert(collabSchema.conversationParticipant).values(
    ["depthead", "member", "member2"].map((key) => ({
      id: id("part", `${key}`),
      conversationId,
      officerId: officerIds[key]!,
    })),
  );

  const messages = [
    {
      key: "m1",
      officer: "depthead",
      body: "@Ahmed please inspect this location. Twelve reports now, and one mentions a burst tyre.",
      mentions: ["member"],
      minutesAgo: 320,
    },
    {
      key: "m2",
      officer: "member",
      body: "I reviewed the reports. The location appears consistent — all of them are within 60 m and the photographs show the same defect from different angles.",
      mentions: [],
      minutesAgo: 260,
    },
    {
      key: "m3",
      officer: "depthead",
      body: "Inspection has been scheduled for Thursday morning. @Bilal can you confirm the crew?",
      mentions: ["member2"],
      minutesAgo: 40,
    },
  ];

  for (const message of messages) {
    const createdAt = new Date(Date.now() - message.minutesAgo * 60_000);

    await db.insert(collabSchema.issueMessage).values({
      id: id("msg", message.key),
      conversationId,
      officerId: officerIds[message.officer]!,
      body: message.body,
      createdAt,
    });

    for (const mentioned of message.mentions) {
      await db.insert(collabSchema.messageMention).values({
        id: id("mention", `${message.key}_${mentioned}`),
        messageId: id("msg", message.key),
        officerId: officerIds[mentioned]!,
      });

      /*
       * The notification is what makes a mention useful — it carries the issue
       * code and the conversation id, so the inbox entry opens the exact
       * thread the officer was named in.
       */
      await db.insert(collabSchema.officerNotification).values({
        id: id("notif", `${message.key}_${mentioned}`),
        officerId: officerIds[mentioned]!,
        kind: "mention",
        title: `${message.officer === "depthead" ? "Sara Khan" : "A colleague"} mentioned you`,
        body: message.body.slice(0, 240),
        issueId,
        issueCode: "CIV-CDA-000007",
        conversationId,
        createdAt,
      });
    }
  }

  // -- A question to a citizen, still unanswered ---------------------------
  const threadId = id("clar", "tyre");
  await db.insert(collabSchema.clarificationThread).values({
    id: threadId,
    issueId,
    reportId: id("report", "r3"),
    citizenUserId,
    openedByOfficerId: officerIds.member!,
    deptId: roads.id,
    status: "open",
  });

  await db.insert(collabSchema.clarificationMessage).values({
    id: id("clarmsg", "1"),
    threadId,
    senderKind: "officer",
    officerId: officerIds.member!,
    body: "Thank you for reporting this. Could you tell us whether the damage is on the left or right side of the road as you face the masjid?",
  });

  // -- Summary --------------------------------------------------------------
  console.log("\nDone.\n");
  console.log("  Sign in at http://localhost:3000/gov/login");
  console.log(`  Password for every account below: ${PASSWORD}\n`);
  console.log("  admin@civicai.pk      platform admin  — sees every organisation");
  console.log("  orghead@cda.gov.pk    org head        — CDA, routes issues to departments");
  console.log("  depthead@cda.gov.pk   dept head       — Road & Infrastructure");
  console.log("  member@cda.gov.pk     member          — Road & Infrastructure (2 mentions waiting)");
  console.log("  bilal@cda.gov.pk      member          — Road & Infrastructure (1 mention waiting)");
  console.log("\n  Citizen at http://localhost:3000/auth/sign-in");
  console.log("  citizen@example.com   5 reports, 3 issues, 1 unanswered question\n");
}

/*
 * Close the connection pool explicitly before exiting.
 *
 * An earlier seed called process.exit(0) with the pool still open and left the
 * database wedged. The pool is not exported from src/db (the client is built
 * lazily behind a Proxy), so it is reached through Drizzle's own $client
 * handle, which for the node-postgres driver IS the pg Pool.
 */
async function closePool() {
  const client = (db as unknown as {
    $client?: { end?: () => Promise<void>; close?: () => Promise<void> };
  }).$client;

  // node-postgres exposes end(); PGlite exposes close(). Only end() was
  // handled, so against the embedded development database NOTHING was closed
  // and process.exit(0) tore the process down with PGlite's WASM buffers
  // unflushed — leaving a data directory the next process cannot open at all
  // ("RuntimeError: Aborted()" on the first query). Close whichever exists.
  if (typeof client?.end === "function") await client.end();
  else if (typeof client?.close === "function") await client.close();
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\nSeed failed:", error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
