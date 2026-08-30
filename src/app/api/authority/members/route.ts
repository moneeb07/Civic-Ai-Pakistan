import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { account, user } from "@/db/schema";
import { authority, authorityMember, department } from "@/db/authority/schema";
import { auth } from "@/lib/auth";
import { getAuthorityViewer } from "@/lib/authority/access";
import { formatMemberCode, inviteMemberSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * A one-time password for a new member to sign in with and change.
 *
 * Returned to the admin exactly once in the response and never written
 * anywhere in plaintext — only Better Auth's hash of it is stored. With no
 * transactional email provider configured, handing the admin a credential to
 * pass on is the honest option; a "an invitation email has been sent" screen
 * that sends nothing would not be.
 */
function temporaryPassword(): string {
  return `Civic-${randomBytes(6).toString("base64url")}`;
}

/*
 * POST /api/authority/members
 *
 * Adds someone to the authority, optionally scoped to a department. The
 * account it creates is an ordinary Better Auth account — the same sign-in
 * path citizens use — because the brief is explicit that there must not be a
 * second authentication system.
 */
export async function POST(request: Request) {
  const viewer = await getAuthorityViewer();
  if (!viewer?.isAdmin) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const admin = viewer.memberships.find((m) => m.accessType === "authority_admin");
  if (!admin) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const parsed = inviteMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please check the member details.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { name, email, departmentId, accessType } = parsed.data;

  /*
   * A department member must actually have a department, and it must belong to
   * the admin's own authority — otherwise an admin could attach a member to
   * another authority's department by guessing an id.
   */
  let resolvedDepartmentId: string | null = null;

  if (accessType === "department_member") {
    if (!departmentId) {
      return NextResponse.json(
        { success: false, message: "Choose a department for this member." },
        { status: 400 },
      );
    }

    const [dept] = await db
      .select({ id: department.id })
      .from(department)
      .where(
        and(eq(department.id, departmentId), eq(department.authorityId, admin.authorityId)),
      )
      .limit(1);

    if (!dept) {
      return NextResponse.json(
        { success: false, message: "That department does not exist." },
        { status: 400 },
      );
    }

    resolvedDepartmentId = dept.id;
  }

  // An existing account is reused rather than duplicated: the same person may
  // already be a citizen of CivicAI, and they should not need a second login.
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  let userId = existingUser?.id ?? null;
  let issuedPassword: string | null = null;

  if (!userId) {
    const password = temporaryPassword();
    const context = await auth.$context;
    const hash = await context.password.hash(password);

    userId = newId();
    const now = new Date();

    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    /*
     * Must match what Better Auth writes for its own sign-ups: `accountId` is
     * the user id (not the email) and the issuer is "local:credential". Any
     * other shape yields a row that looks right but can never be signed in to.
     */
    await db.insert(account).values({
      id: newId(),
      issuer: "local:credential",
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });

    issuedPassword = password;
  } else {
    const [duplicate] = await db
      .select({ id: authorityMember.id })
      .from(authorityMember)
      .where(
        and(
          eq(authorityMember.userId, userId),
          eq(authorityMember.authorityId, admin.authorityId),
        ),
      )
      .limit(1);

    if (duplicate) {
      return NextResponse.json(
        { success: false, message: "That person is already a member here." },
        { status: 409 },
      );
    }
  }

  // Member codes come off the authority's own counter, so they are unique
  // within the authority and stable once issued.
  const [row] = await db
    .select({ code: authority.code, sequence: authority.memberSequence })
    .from(authority)
    .where(eq(authority.id, admin.authorityId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ success: false, message: "Authority not found." }, { status: 404 });
  }

  const sequence = row.sequence + 1;
  const memberCode = formatMemberCode(row.code, sequence);

  await db.insert(authorityMember).values({
    id: newId(),
    userId,
    authorityId: admin.authorityId,
    departmentId: resolvedDepartmentId,
    memberCode,
    accessType,
    displayName: name,
  });

  await db
    .update(authority)
    .set({ memberSequence: sequence })
    .where(eq(authority.id, admin.authorityId));

  return NextResponse.json({
    success: true,
    data: {
      memberCode,
      // Shown to the admin once, so they can pass it on. Never logged.
      temporaryPassword: issuedPassword,
    },
  });
}
