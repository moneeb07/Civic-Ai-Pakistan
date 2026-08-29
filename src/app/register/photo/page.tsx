import { redirect } from "next/navigation";

import { PhotoStep } from "@/components/registration/photo-step";
import { RegistrationShell } from "@/components/registration/registration-shell";
import { getRegistrationSession } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PhotoPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();
  if (!registration?.data.city) redirect("/register/address");

  return (
    <RegistrationShell step="photo" backHref="/register/address">
      <PhotoStep />
    </RegistrationShell>
  );
}
