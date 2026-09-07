import { Building2, IdCard, Mail, ShieldCheck, User } from "lucide-react";

import { GovShell, GovPageHeading } from "@/components/gov/gov-shell";
import { GovSignOutButton } from "@/components/gov/gov-account-menu";
import { Avatar } from "@/components/ui/avatar";
import { requireOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const dynamic = "force-dynamic";

/*
 * The officer's own account.
 *
 * Everything here is already known to the shell — it is drawn in the sidebar
 * on every screen. It is repeated on a page of its own because "who am I
 * signed in as, and how do I sign out" is a question people go LOOKING for an
 * answer to, and a caption under an avatar is not somewhere anyone looks. It
 * is also where sign-out belongs: a destructive-ish action that should take a
 * deliberate navigation, not sit one stray click away from the queue.
 *
 * Read-only. An officer's name, role, organisation and department are set by
 * whoever invited them, and letting someone edit their own role here would be
 * a privilege-escalation route dressed up as a profile form.
 */
export default async function GovAccountPage() {
  const { officer } = await requireOfficer();

  const rows = [
    { icon: User, label: "Name", value: officer.name },
    { icon: Mail, label: "Email", value: officer.email },
    { icon: ShieldCheck, label: "Role", value: t.gov.roles[officer.role] },
    { icon: Building2, label: "Organisation", value: officer.orgName ?? "—" },
    { icon: IdCard, label: "Department", value: officer.deptName ?? "—" },
  ];

  return (
    <GovShell officer={officer} backHref="/gov">
      <GovPageHeading
        title="Your account"
        subtitle="How you appear to colleagues and citizens across the portal."
      />

      <div className="max-w-2xl">
        <div className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-5">
          <Avatar name={officer.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[1.0625rem] font-semibold text-ink">{officer.name}</p>
            <p className="truncate text-[0.875rem] text-muted">
              {t.gov.roles[officer.role]}
              {officer.deptName ? ` · ${officer.deptName}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-surface">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.label}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4"
              >
                <dt className="flex min-w-[9rem] items-center gap-2.5 text-[0.8125rem] font-medium text-muted">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {row.label}
                </dt>
                <dd className="min-w-0 flex-1 break-words text-[0.9375rem] text-ink">
                  {row.value}
                </dd>
              </div>
            );
          })}
        </dl>

        <div className="mt-4 rounded-[18px] border border-line bg-surface p-5">
          <p className="text-[0.9375rem] font-semibold text-ink">Sign out</p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
            Ends this session on this device. Anything you have already submitted stays
            exactly as it is.
          </p>
          <GovSignOutButton className="mt-4" />
        </div>
      </div>
    </GovShell>
  );
}
