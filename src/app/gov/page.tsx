import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";

export const dynamic = "force-dynamic";

/**
 * /gov — the role router.
 *
 * Sign-in and invite acceptance both land here rather than choosing a
 * destination themselves, so "which dashboard does this person get" is
 * answered in exactly one place, from the officer record, on the server.
 */
export default async function GovEntryPage() {
  const { officer } = await requireOfficer();
  redirect(ROLE_HOME[officer.role]);
}
