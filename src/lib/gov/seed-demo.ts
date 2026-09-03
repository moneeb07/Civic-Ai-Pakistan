/*
 * Builds a complete, working government hierarchy plus one confirmed citizen
 * complaint, so the portal can be opened and exercised immediately.
 *
 *   npx tsx src/lib/gov/seed-demo.ts
 *
 * STOP `next dev` FIRST. The local PGlite database allows a single writer, and
 * opening it from a second process while the dev server holds it corrupts it
 * (the hazard STAGE_2_SETUP.md documents). If that happens:
 *
 *   rm -rf .data/civicai && npm run db:migrate && npx tsx src/lib/gov/seed-demo.ts
 *
 * This is development scaffolding, not production code: it writes to `report`
 * directly to stand in for a citizen having completed the Stage 2 flow. That
 * is the ONE place gov-side code touches that table, and it is deliberately
 * confined to this file so the read-only invariant holds everywhere else.
 *
 * Idempotent: re-running it reuses existing accounts and adds one more
 * complaint to route.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { auth } from "@/lib/auth";
import { newId } from "./ids";
import { DEFAULT_WORKFLOW_STAGES } from "./schema";

const PASSWORD = "DemoPass123!";

async function upsertUser(name: string, email: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (existing) return existing.id;

  const created = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  const id = created?.user?.id;
  if (!id) throw new Error(`Better Auth did not return a user id for ${email}`);
  return id;
}

async function upsertOfficer(
  userId: string,
  role: string,
  orgId: string | null,
  deptId: string | null,
): Promise<string> {
  const [existing] = await db
    .select({ id: govSchema.officer.id })
    .from(govSchema.officer)
    .where(eq(govSchema.officer.userId, userId))
    .limit(1);

  if (existing) return existing.id;

  const id = newId();
  await db.insert(govSchema.officer).values({ id, userId, role, orgId, deptId });
  return id;
}

async function main() {
  // --- Organization -------------------------------------------------------
  let [org] = await db
    .select()
    .from(govSchema.organization)
    .where(eq(govSchema.organization.code, "CDA"))
    .limit(1);

  if (!org) {
    const id = newId();
    await db.insert(govSchema.organization).values({
      id,
      name: "Capital Development Authority",
      code: "CDA",
    });
    [org] = await db
      .select()
      .from(govSchema.organization)
      .where(eq(govSchema.organization.id, id))
      .limit(1);
  }

  // --- Department ---------------------------------------------------------
  let [dept] = await db
    .select()
    .from(govSchema.department)
    .where(
      and(
        eq(govSchema.department.orgId, org!.id),
        eq(govSchema.department.name, "Roads & Infrastructure"),
      ),
    )
    .limit(1);

  if (!dept) {
    const id = newId();
    await db.insert(govSchema.department).values({
      id,
      orgId: org!.id,
      name: "Roads & Infrastructure",
      handlesCategories: ["POTHOLE", "ROAD_DAMAGE", "DAMAGED_FOOTPATH"],
    });
    [dept] = await db
      .select()
      .from(govSchema.department)
      .where(eq(govSchema.department.id, id))
      .limit(1);
  }

  // --- Officers -----------------------------------------------------------
  const adminId = await upsertUser("Platform Administrator", "admin@civicai.local");
  await upsertOfficer(adminId, "platform_admin", null, null);

  const orgHeadId = await upsertUser("Bilal Ahmed", "orghead@cda.gov.pk");
  const orgHeadOfficerId = await upsertOfficer(orgHeadId, "org_head", org!.id, null);

  const deptHeadId = await upsertUser("Sana Iqbal", "depthead@cda.gov.pk");
  await upsertOfficer(deptHeadId, "dept_head", org!.id, dept!.id);

  const memberId = await upsertUser("Usman Tariq", "member@cda.gov.pk");
  await upsertOfficer(memberId, "member", org!.id, dept!.id);

  // A second member, so multi-assignee and the group chat have someone to add.
  const member2Id = await upsertUser("Hina Raza", "member2@cda.gov.pk");
  await upsertOfficer(member2Id, "member", org!.id, dept!.id);

  // --- Workflow (the default template, saved so assignment is possible) ----
  const [existingWorkflow] = await db
    .select()
    .from(govSchema.deptWorkflow)
    .where(eq(govSchema.deptWorkflow.deptId, dept!.id))
    .limit(1);

  if (!existingWorkflow) {
    const workflowId = newId();
    await db.insert(govSchema.deptWorkflow).values({
      id: workflowId,
      deptId: dept!.id,
      updatedByOfficerId: orgHeadOfficerId,
    });
    await db.insert(govSchema.deptWorkflowStage).values(
      DEFAULT_WORKFLOW_STAGES.map((stage, index) => ({
        id: newId(),
        workflowId,
        position: index,
        name: stage.name,
        description: stage.description ?? null,
        requiresPhoto: stage.requiresPhoto,
        requiresNote: stage.requiresNote,
        slaHours: stage.slaHours ?? null,
        isTerminal: stage.isTerminal,
      })),
    );
  }

  // --- One confirmed citizen complaint, waiting to be routed --------------
  const citizenId = await upsertUser("Ayesha Khan", "citizen@civicai.test");
  const reportId = newId();
  await db.insert(schema.report).values({
    id: reportId,
    userId: citizenId,
    status: "ready_for_submission",
    category: "POTHOLE",
    categorySource: "ai",
    title: "Large pothole on Srinagar Highway",
    titleSource: "ai",
    description:
      "A large pothole on the road is causing difficulty for vehicles. This issue was reported on Srinagar Highway in Islamabad.",
    descriptionSource: "ai",
    severity: "MEDIUM",
    severitySource: "ai",
    transcript: "Yahan road mein bara gaddha hai aur gariyon ko mushkil ho rahi hai",
    transcriptLanguage: "Urdu",
    transcriptSource: "manual",
    locationLabel: "Srinagar Highway, Zone 1, Islamabad Capital Territory, 44080, Pakistan",
    locationSource: "gps",
    latitude: 33.68,
    longitude: 73.05,
  });

  console.log(`
Demo data ready. Every account uses the password: ${PASSWORD}

  Platform admin   admin@civicai.local     -> /gov/admin
  Organization head orghead@cda.gov.pk     -> /gov/org
  Department head  depthead@cda.gov.pk     -> /gov/dept
  Field member     member@cda.gov.pk       -> /gov/work
  Field member     member2@cda.gov.pk      -> /gov/work
  Citizen          citizen@civicai.test    -> /dashboard

  Organization: ${org!.name} (${org!.code})
  Department:   ${dept!.name}  (workflow: New -> In Progress -> Resolved)
  Complaint:    ${reportId}  (status ready_for_submission, waiting to be routed)

Start the server with \`npm run dev\` and sign in at http://localhost:3000/gov/login
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding demo data failed:", error);
    process.exit(1);
  });
