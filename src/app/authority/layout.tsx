import type { Metadata } from "next";

import { AuthorityShell } from "@/components/authority/authority-shell";
import { requireAuthorityViewer } from "@/lib/authority/access";

export const metadata: Metadata = { title: "CivicAI Authority" };

/*
 * The single gate for the whole authority section.
 *
 * Every page below this inherits the check, and each one re-checks whatever it
 * scopes to (a department, an issue) on its own — a layout guard alone is not
 * authorisation, only the outer door.
 */
export default async function AuthorityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireAuthorityViewer();
  return <AuthorityShell viewer={viewer}>{children}</AuthorityShell>;
}
