"use client";

import * as React from "react";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { GovField } from "@/components/gov/gov-field";
import { EmptyState, InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { formatNumber } from "@/lib/gov/format";
import { createOrganizationSchema, type OrganizationDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/** Platform administration: create government bodies, then invite a head for each. */
export function OrgManager({ initialOrgs }: { initialOrgs: OrganizationDto[] }) {
  const toast = useToast();
  const [orgs, setOrgs] = React.useState(initialOrgs);
  const [values, setValues] = React.useState({ name: "", code: "" });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const parsed = createOrganizationSchema.safeParse(values);
  const fieldErrors: Partial<Record<"name" | "code", string[]>> = parsed.success
    ? {}
    : parsed.error.flatten().fieldErrors;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ name: true, code: true });
    if (!parsed.success) return;

    setBusy(true);
    setError(null);

    try {
      const created = await api.createOrganization(parsed.data);
      setOrgs((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setValues({ name: "", code: "" });
      setTouched({});
      toast.success(t.gov.admin.orgCreated);
    } catch (cause) {
      const message = cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardBody>
          <CardEyebrow>{t.gov.admin.createOrgTitle}</CardEyebrow>

          <form onSubmit={onSubmit} noValidate className="mt-4">
            {error ? <InlineError message={error} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <GovField
                id="org-name"
                label={t.gov.admin.orgNameLabel}
                placeholder={t.gov.admin.orgNamePlaceholder}
                value={values.name}
                onChange={(event) => setValues((c) => ({ ...c, name: event.target.value }))}
                onBlur={() => setTouched((c) => ({ ...c, name: true }))}
                error={touched.name && fieldErrors.name ? "Enter the organization's name." : null}
                disabled={busy}
              />

              <GovField
                id="org-code"
                label={t.gov.admin.orgCodeLabel}
                placeholder={t.gov.admin.orgCodePlaceholder}
                hint={t.gov.admin.orgCodeHint}
                // Uppercased as typed so the pattern the schema enforces is
                // never something the officer has to discover by failing.
                value={values.code}
                onChange={(event) =>
                  setValues((c) => ({ ...c, code: event.target.value.toUpperCase() }))
                }
                onBlur={() => setTouched((c) => ({ ...c, code: true }))}
                error={touched.code && fieldErrors.code ? fieldErrors.code[0] ?? null : null}
                disabled={busy}
              />
            </div>

            <Button type="submit" loading={busy} className="mt-5">
              {busy ? t.gov.admin.creating : t.gov.admin.createOrg}
            </Button>
          </form>
        </CardBody>
      </Card>

      <section className="mt-4">
        <CardEyebrow className="mb-3 block">{t.gov.admin.orgsEyebrow}</CardEyebrow>

        {orgs.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t.gov.admin.noOrgsTitle}
            body={t.gov.admin.noOrgsBody}
          />
        ) : (
          <ul className="space-y-2">
            {orgs.map((org) => (
              <li
                key={org.id}
                className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-civic-100 text-civic-700">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                    {org.name}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted">
                    {org.code} · {formatNumber(org.departmentCount)} {t.gov.admin.departmentCount}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
