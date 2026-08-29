import { redirect } from "next/navigation";

import { IdentityFlow } from "@/components/registration/identity-flow";
import { RegistrationShell } from "@/components/registration/registration-shell";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function IdentityPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <RegistrationShell step="identity" backHref="/auth/sign-in">
      <IdentityFlow />
    </RegistrationShell>
  );
}
