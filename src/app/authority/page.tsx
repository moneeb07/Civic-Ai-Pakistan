import { redirect } from "next/navigation";

import { requireAuthorityViewer } from "@/lib/authority/access";

export const dynamic = "force-dynamic";

/**
 * Entry point: sends people to the dashboard their access actually gives them.
 *
 * An admin gets the authority overview; a member goes straight to their
 * department. A member of several departments lands on the first and can
 * switch from the header — there is no "choose your workspace" screen for a
 * choice most people never have.
 */
export default async function AuthorityIndexPage() {
  const viewer = await requireAuthorityViewer();

  if (viewer.isAdmin) redirect("/authority/admin");

  const first = viewer.memberships.find((m) => m.departmentId !== null);
  if (first?.departmentId) redirect(`/authority/departments/${first.departmentId}`);

  redirect("/authority/issues");
}
