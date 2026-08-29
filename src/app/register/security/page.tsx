import { redirect } from "next/navigation";

import { RegistrationShell } from "@/components/registration/registration-shell";
import { SecurityForm } from "@/components/registration/security-form";
import { getRegistrationSession } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();
  if (!registration?.data.cnicEncrypted) redirect("/register/identity");
  if (!registration.data.email) redirect("/register/contact");

  return (
    <RegistrationShell step="security" backHref="/register/contact">
      <SecurityForm />
    </RegistrationShell>
  );
}
