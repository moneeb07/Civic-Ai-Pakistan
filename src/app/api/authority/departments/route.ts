import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { department } from "@/db/authority/schema";
import { getAuthorityViewer } from "@/lib/authority/access";
import { createDepartmentSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/*
 * POST /api/authority/departments
 *
 * Creates a department and, with it, its routing rule: the categories it
 * declares are immediately what the routing agent sends here. No code change,
 * no redeploy — which is what makes the structure configurable rather than a
 * hardcoded picture of one authority.
 */
export async function POST(request: Request) {
  const viewer = await getAuthorityViewer();
  if (!viewer?.isAdmin) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const parsed = createDepartmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please check the department details.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const admin = viewer.memberships.find((m) => m.accessType === "authority_admin");
  if (!admin) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return NextResponse.json(
      { success: false, message: "Please use a name with letters or numbers." },
      { status: 400 },
    );
  }

  const [clash] = await db
    .select({ id: department.id })
    .from(department)
    .where(
      and(eq(department.authorityId, admin.authorityId), eq(department.slug, slug)),
    )
    .limit(1);

  if (clash) {
    return NextResponse.json(
      { success: false, message: "A department with that name already exists." },
      { status: 409 },
    );
  }

  const id = randomBytes(16).toString("base64url");

  await db.insert(department).values({
    id,
    authorityId: admin.authorityId,
    name: parsed.data.name,
    slug,
    description: parsed.data.description || null,
    categories: JSON.stringify(parsed.data.categories),
  });

  return NextResponse.json({ success: true, data: { id, slug } });
}
