"use client";

import * as React from "react";
import { Mail, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { GovField } from "@/components/gov/gov-field";
import { EmptyState, InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import { ConfirmDialog } from "@/components/gov/confirm-dialog";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { formatTimestamp } from "@/lib/gov/format";
import { createInviteSchema, type InviteDto, type OfficerRole } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Create and revoke invitations.
 *
 * `role`, `orgId` and `deptId` are fixed by the caller rather than chosen
 * here, because each dashboard can only invite into its own scope: an org
 * head invites dept heads into their org, a dept head invites members into
 * their dept. The server re-checks all of it in canInvite() — this component
 * shapes the request, it does not grant anything.
 */
export interface ScopeOption {
  id: string;
  label: string;
}

export function InviteManager({
  role,
  orgId,
  deptId,
  orgOptions,
  deptOptions,
  initialInvites,
}: {
  role: OfficerRole;
  orgId: string | null;
  deptId: string | null;
  /*
   * Given when the inviter may choose the scope the invite is for — a platform
   * admin picking an organization, an org head picking a department. Omitted
   * when the scope is fixed by who the inviter is (a dept head can only invite
   * into their own department).
   */
  orgOptions?: ScopeOption[];
  deptOptions?: ScopeOption[];
  initialInvites: InviteDto[];
}) {
  const toast = useToast();
  const [invites, setInvites] = React.useState(initialInvites);
  const [email, setEmail] = React.useState("");
  const [selectedOrgId, setSelectedOrgId] = React.useState(orgOptions?.[0]?.id ?? orgId);
  const [selectedDeptId, setSelectedDeptId] = React.useState(deptOptions?.[0]?.id ?? deptId);
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingRevoke, setPendingRevoke] = React.useState<InviteDto | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const effectiveOrgId = orgOptions ? selectedOrgId : orgId;
  const effectiveDeptId = deptOptions ? selectedDeptId : deptId;

  const parsed = createInviteSchema.safeParse({
    email,
    role,
    orgId: effectiveOrgId,
    deptId: effectiveDeptId,
  });
  const emailInvalid = !parsed.success && email.length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!parsed.success) return;

    setBusy(true);
    setError(null);

    try {
      const result = await api.createInvite({
        email: parsed.data.email,
        role,
        orgId: effectiveOrgId,
        deptId: effectiveDeptId,
      });

      // "Sent" and "printed to the console" are different facts and the
      // operator is told which one actually happened.
      toast.success(
        result.delivered === "terminal" ? t.gov.invite.sentTerminal : t.gov.invite.sent,
      );

      setEmail("");
      setTouched(false);
      setInvites(await api.listInvites());
    } catch (cause) {
      const message = cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;

    setRevoking(true);
    try {
      await api.revokeInvite(pendingRevoke.id);
      setInvites((current) => current.filter((invite) => invite.id !== pendingRevoke.id));
      toast.success(t.gov.invite.revoked);
      setPendingRevoke(null);
    } catch (cause) {
      toast.error(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <Card>
        <CardBody>
          <CardEyebrow>{t.gov.invite.manageTitle}</CardEyebrow>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
            {t.gov.invite.manageSubtitle}
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-5">
            {error ? <InlineError message={error} /> : null}

            {orgOptions && orgOptions.length > 0 ? (
              <GovField id="invite-org" label={t.gov.invite.inviteOrgLabel} className="mb-3">
                <select
                  id="invite-org"
                  value={selectedOrgId ?? ""}
                  onChange={(event) => setSelectedOrgId(event.target.value)}
                  disabled={busy}
                  className="min-h-12 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
                >
                  {orgOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </GovField>
            ) : null}

            {deptOptions && deptOptions.length > 0 ? (
              <GovField id="invite-dept" label={t.gov.invite.inviteDeptLabel} className="mb-3">
                <select
                  id="invite-dept"
                  value={selectedDeptId ?? ""}
                  onChange={(event) => setSelectedDeptId(event.target.value)}
                  disabled={busy}
                  className="min-h-12 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
                >
                  {deptOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </GovField>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <GovField
                id="invite-email"
                label={t.gov.invite.inviteEmailLabel}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder={t.gov.invite.inviteEmailPlaceholder}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && emailInvalid ? "Enter a valid email address." : null}
                hint={`${t.gov.invite.inviteRoleLabel}: ${t.gov.roles[role]}`}
                className="flex-1"
                disabled={busy}
              />

              <Button type="submit" loading={busy} className="sm:mt-[1.6875rem]">
                {busy ? t.gov.invite.sending : t.gov.invite.send}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <section className="mt-4">
        <CardEyebrow className="mb-3 block">{t.gov.invite.pendingEyebrow}</CardEyebrow>

        {invites.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={t.gov.invite.noPendingTitle}
            body={t.gov.invite.noPendingBody}
          />
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-canvas">
                  <Mail className="size-5 text-muted" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                    {invite.email}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                    {t.gov.roles[invite.role]}
                    {invite.deptName ? ` · ${invite.deptName}` : ""} · {t.gov.invite.expiresOn}{" "}
                    {formatTimestamp(invite.expiresAt)}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setPendingRevoke(invite)}
                  aria-label={`${t.gov.invite.revoke} ${invite.email}`}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 className="size-[18px]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={`${t.gov.invite.revoke} invitation?`}
        body={
          pendingRevoke
            ? `${pendingRevoke.email} will no longer be able to use their invitation link.`
            : ""
        }
        confirmLabel={t.gov.invite.revoke}
        destructive
        busy={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setPendingRevoke(null)}
      />
    </>
  );
}
