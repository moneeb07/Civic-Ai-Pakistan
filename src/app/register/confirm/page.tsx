import { redirect } from "next/navigation";

import { ConfirmStep, type ConfirmSummary } from "@/components/registration/confirm-step";
import { RegistrationShell } from "@/components/registration/registration-shell";
import { maskEmail, maskPhone } from "@/lib/cnic";
import { getRegistrationSession } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConfirmPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();
  const data = registration?.data;

  if (!data?.cnicEncrypted) redirect("/register/identity");
  if (!data.email || !data.phone) redirect("/register/contact");
  if (!data.city || !data.residentialAddress) redirect("/register/address");

  /*
   * Everything sensitive is masked before it reaches the browser. The full CNIC
   * stays encrypted server-side and the raw number is never sent back here.
   */
  const summary: ConfirmSummary = {
    fullName: data.fullName ?? "",
    fatherName: data.fatherName ?? null,
    cnicMasked: data.cnicMasked ?? "*****-*******-*",
    dateOfBirth: data.dateOfBirth ?? null,
    gender: data.gender ?? null,
    identitySource: data.identitySource ?? "manual",
    phoneMasked: maskPhone(data.phone),
    emailMasked: maskEmail(data.email),
    city: data.city ?? null,
    houseNumber: data.houseNumber ?? null,
    district: data.district ?? null,
    sector: data.sector ?? null,
    residentialAddress: data.residentialAddress ?? null,
    /*
     * What the citizen confirmed on the Address step. Falls back to the line
     * printed on the card only when they left the box untouched, so the final
     * review always shows the value that will actually be saved.
     */
    permanentAddress:
      data.permanentAddress ?? data.cnicPermanentAddress?.raw ?? null,
    hasProfileImage: Boolean(data.profileImage),
    profileImage: data.profileImage ?? null,
  };

  return (
    <RegistrationShell step="confirm" backHref="/register/photo">
      <ConfirmStep summary={summary} />
    </RegistrationShell>
  );
}
