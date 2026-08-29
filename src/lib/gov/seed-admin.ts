/*
 * Creates the first platform administrator.
 *
 * The portal has no public sign-up by design, which leaves a bootstrap
 * problem: the first officer cannot be invited, because there is nobody to
 * invite them. This script is that one-time entry point.
 *
 * Run it directly — it lives here rather than in scripts/ because scripts/ is
 * outside this ticket's ownership boundary:
 *
 *   GOV_ADMIN_EMAIL=admin@civicai.local \
 *   GOV_ADMIN_PASSWORD='choose-a-strong-one' \
 *   npx tsx src/lib/gov/seed-admin.ts
 *
 * Stop `next dev` first: the local PGlite database allows one writer, and a
 * second process opening ./.data/civicai while the dev server holds it has
 * corrupted it before (see STAGE_2_SETUP.md).
 *
 * Idempotent: an existing officer row for that email is reported and left
 * alone rather than duplicated.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";

const DEFAULT_EMAIL = "admin@civicai.local";

async function main() {
  const email = (process.env.GOV_ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.GOV_ADMIN_PASSWORD;
  const name = process.env.GOV_ADMIN_NAME ?? "Platform Administrator";

  if (!password || password.length < 8) {
    console.error(
      "GOV_ADMIN_PASSWORD is required and must be at least 8 characters.\n" +
        "It is passed straight to Better Auth and never written anywhere by this script.",
    );
    process.exit(1);
  }

  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (existingUser) {
    const [existingOfficer] = await db
      .select({ id: govSchema.officer.id, role: govSchema.officer.role })
      .from(govSchema.officer)
      .where(eq(govSchema.officer.userId, existingUser.id))
      .limit(1);

    if (existingOfficer) {
      console.log(`${email} already has an officer record (${existingOfficer.role}). Nothing to do.`);
      return;
    }

    // The account exists as a citizen; grant it platform admin rather than
    // failing, since that is plainly what running this was meant to do.
    await db.insert(govSchema.officer).values({
      id: newId(),
      userId: existingUser.id,
      role: "platform_admin",
      orgId: null,
      deptId: null,
    });

    console.log(`Granted platform_admin to the existing account ${email}.`);
    return;
  }

  // Imported lazily so the env checks above run before Better Auth touches
  // the database at all.
  const { auth } = await import("@/lib/auth");

  const created = await auth.api.signUpEmail({
    body: { name, email, password },
  });

  const userId = created?.user?.id;
  if (!userId) throw new Error("Better Auth did not return a user id.");

  await db.insert(govSchema.officer).values({
    id: newId(),
    userId,
    role: "platform_admin",
    orgId: null,
    deptId: null,
  });

  console.log(`Created platform administrator ${email}. Sign in at /gov/login.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding the platform administrator failed:", error);
    process.exit(1);
  });
