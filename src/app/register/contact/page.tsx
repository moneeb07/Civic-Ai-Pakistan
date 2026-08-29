import { redirect } from "next/navigation";

import { ContactForm } from "@/components/registration/contact-form";
import { RegistrationShell } from "@/components/registration/registration-shell";
import { getRegistrationSession } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();

  // Cannot deep-link past identity: the server, not the wizard, decides this.
  if (!registration?.data.cnicEncrypted) redirect("/register/identity");

  return (
    <RegistrationShell step="contact" backHref="/register/identity">
      <ContactForm
        initialPhone={registration.data.phone ?? ""}
        initialEmail={registration.data.email ?? ""}
      />
    </RegistrationShell>
  );
}
