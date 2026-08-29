import { redirect } from "next/navigation";

import { getRegistrationSession, firstIncompleteStep } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Entry point: resumes an in-progress registration, or starts a new one. */
export default async function RegisterIndexPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();

  if (!registration) redirect("/register/identity");
  redirect(`/register/${firstIncompleteStep(registration.data)}`);
}
