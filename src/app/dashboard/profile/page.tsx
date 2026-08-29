import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, ScanLine, UserRound } from "lucide-react";

import { SignOutButton } from "@/app/home/sign-out-button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getCitizenProfile } from "@/lib/profile";
import { requireSession } from "@/lib/session";

const t = getDictionary();

export const metadata: Metadata = { title: t.profile.title };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession();
  const profile = await getCitizenProfile(session.user.id);

  // An account without a profile predates the registration flow; send it there.
  if (!profile) redirect("/home");

  /*
   * House/Makan No., City and District already have their own rows below —
   * repeating them here produced a visibly duplicated line ("House 1, House 1,
   * Street 1, Karachi, Street 1, Karachi, Karachi") for any citizen whose
   * free-text residential address also happened to restate those parts, which
   * is the natural thing to type. Only the fields with no row of their own
   * belong in this combined line.
   */
  const addressLine = [profile.street, profile.road, profile.sector, profile.residentialAddress]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-5">
      <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink">
        {t.profile.title}
      </h1>

      {/* Identity header */}
      <div className="mt-5 flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <span className="size-16 shrink-0 overflow-hidden rounded-full border border-line bg-civic-50">
          {profile.hasProfileImage ? (
            // Served from an authenticated route, not a public path.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/profile/image"
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <UserRound className="size-8 text-civic-500" aria-hidden="true" />
            </span>
          )}
        </span>

        <div className="min-w-0">
          <p className="truncate text-[1.0625rem] font-semibold text-ink">
            {profile.fullName}
          </p>
          {profile.city ? (
            <p className="mt-0.5 truncate text-[0.875rem] text-muted">
              {profile.city}, Pakistan
            </p>
          ) : null}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-civic-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-civic-700">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            {t.profile.active}
          </span>
        </div>
      </div>

      {/* Identity */}
      <Card className="mt-4">
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardEyebrow>{t.profile.identitySection}</CardEyebrow>
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted">
              {profile.identitySource === "cnic_scan" ? (
                <>
                  <ScanLine className="size-3" aria-hidden="true" />
                  {t.profile.extractedFromCnic}
                </>
              ) : (
                t.profile.enteredManually
              )}
            </span>
          </div>

          <Rows
            rows={[
              { label: t.profile.fullName, value: profile.fullName },
              { label: t.profile.fatherName, value: profile.fatherName },
              // Masked, always. The full number never leaves the server.
              { label: t.profile.cnic, value: profile.cnicMasked, mono: true },
              { label: t.profile.dateOfBirth, value: profile.dateOfBirth },
              { label: t.profile.gender, value: profile.gender },
            ]}
          />
        </CardBody>
      </Card>

      {/* Contact */}
      <Card className="mt-4">
        <CardBody>
          <CardEyebrow>{t.profile.contactSection}</CardEyebrow>
          <Rows
            rows={[
              { label: t.profile.phone, value: profile.phone, mono: true },
              { label: t.profile.email, value: session.user.email, mono: true },
            ]}
          />
        </CardBody>
      </Card>

      {/* Address */}
      <Card className="mt-4">
        <CardBody>
          <CardEyebrow>{t.profile.addressSection}</CardEyebrow>
          <Rows
            rows={[
              { label: t.profile.houseNumber, value: profile.houseNumber },
              { label: t.profile.city, value: profile.city },
              { label: t.profile.district, value: profile.district },
              { label: t.profile.address, value: addressLine || null },
            ]}
          />

          {profile.permanentAddress ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">
                {t.profile.permanentAddress}
              </p>
              <p className="mt-1.5 text-[0.875rem] text-ink">
                {profile.permanentAddress}
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Account */}
      <Card className="mt-4">
        <CardBody>
          <CardEyebrow>{t.profile.accountSection}</CardEyebrow>
          <Rows
            rows={[
              {
                label: t.profile.memberSince,
                value: profile.createdAt.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              },
              { label: t.profile.accountStatus, value: t.profile.active },
              {
                label: t.profile.assistedMode,
                value: profile.assistedMode
                  ? t.profile.assistedModeOn
                  : t.profile.assistedModeOff,
              },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-6">
        <SignOutButton className="w-full border-danger/30 text-danger hover:bg-danger-bg hover:text-danger" />
      </div>
    </div>
  );
}

function Rows({
  rows,
}: {
  rows: { label: string; value: string | null | undefined; mono?: boolean }[];
}) {
  return (
    <dl className="mt-4 space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
          <dt className="text-[0.875rem] text-muted">{row.label}</dt>
          <dd
            className={
              row.value
                ? row.mono
                  ? "font-mono text-[0.875rem] font-medium text-ink"
                  : "text-[0.875rem] font-medium text-ink"
                : "text-[0.875rem] text-muted/70"
            }
          >
            {row.value || t.profile.notProvided}
          </dd>
        </div>
      ))}
    </dl>
  );
}
