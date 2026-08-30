import { redirect } from "next/navigation";

import { AddressForm } from "@/components/registration/address-form";
import { RegistrationShell } from "@/components/registration/registration-shell";
import { getRegistrationSession } from "@/lib/registration/session";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AddressPage() {
  if (await getSession()) redirect("/dashboard");

  const registration = await getRegistrationSession();
  if (!registration?.data.email) redirect("/register/contact");

  const {
    houseNumber,
    city,
    district,
    sector,
    street,
    road,
    residentialAddress,
    permanentAddress,
    cnicPresentAddress,
    cnicPermanentAddress,
  } = registration.data;

  return (
    <RegistrationShell step="address" backHref="/register/security">
      <AddressForm
        initial={{
          houseNumber: houseNumber ?? "",
          city: city ?? "",
          district: district ?? "",
          sector: sector ?? "",
          street: street ?? "",
          road: road ?? "",
          residentialAddress: residentialAddress ?? "",
          permanentAddress: permanentAddress ?? "",
        }}
        cnicPresentAddress={cnicPresentAddress ?? null}
        cnicPermanentAddress={cnicPermanentAddress ?? null}
      />
    </RegistrationShell>
  );
}
