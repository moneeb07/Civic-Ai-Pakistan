"use client";

import * as React from "react";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { GovField } from "@/components/gov/gov-field";
import { EmptyState, InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { humanizeCategory } from "@/lib/gov/format";
import { createDepartmentSchema, type DepartmentDto } from "@/lib/gov/schema";
import { CIVIC_CATEGORIES } from "@/lib/report/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * Departments inside one organization.
 *
 * The category checkboxes come from CIVIC_CATEGORIES on the citizen side —
 * the same fixed list the vision model is allowed to choose from — so a
 * department can never be mapped to a complaint type that cannot exist.
 */
export function DeptManager({
  orgId,
  initialDepts,
}: {
  orgId: string;
  initialDepts: DepartmentDto[];
}) {
  const toast = useToast();
  const [depts, setDepts] = React.useState(initialDepts);
  const [name, setName] = React.useState("");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const parsed = createDepartmentSchema.safeParse({
    orgId,
    name,
    handlesCategories: categories,
  });

  function toggleCategory(category: string) {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!parsed.success) return;

    setBusy(true);
    setError(null);

    try {
      const created = await api.createDepartment({
        orgId,
        name: parsed.data.name,
        handlesCategories: parsed.data.handlesCategories,
      });
      setDepts((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setCategories([]);
      setTouched(false);
      toast.success(t.gov.org.deptCreated);
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
          <CardEyebrow>{t.gov.org.createDeptTitle}</CardEyebrow>

          <form onSubmit={onSubmit} noValidate className="mt-4">
            {error ? <InlineError message={error} /> : null}

            <GovField
              id="dept-name"
              label={t.gov.org.deptNameLabel}
              placeholder={t.gov.org.deptNamePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              error={touched && !parsed.success ? "Enter the department's name." : null}
              disabled={busy}
            />

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-ink">
                {t.gov.org.deptCategoriesLabel}
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {CIVIC_CATEGORIES.map((category) => {
                  const checked = categories.includes(category);
                  return (
                    <label
                      key={category}
                      className={
                        checked
                          ? "inline-flex cursor-pointer items-center gap-2 rounded-full border border-civic-200 bg-civic-50 px-3 py-2 text-[0.8125rem] font-medium text-civic-700"
                          : "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-2 text-[0.8125rem] font-medium text-muted transition-colors hover:border-civic-200"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(category)}
                        disabled={busy}
                        className="size-4 accent-civic-600"
                      />
                      {humanizeCategory(category)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Button type="submit" loading={busy} className="mt-5">
              {busy ? t.gov.admin.creating : t.gov.org.createDept}
            </Button>
          </form>
        </CardBody>
      </Card>

      <section className="mt-4">
        <CardEyebrow className="mb-3 block">{t.gov.org.deptsEyebrow}</CardEyebrow>

        {depts.length === 0 ? (
          <EmptyState icon={Layers} title={t.gov.org.noDeptsTitle} body={t.gov.org.noDeptsBody} />
        ) : (
          <ul className="space-y-2">
            {depts.map((dept) => (
              <li
                key={dept.id}
                className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-sky-50 text-sky-700">
                  <Layers className="size-5" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                    {dept.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                    {dept.handlesCategories.length > 0
                      ? dept.handlesCategories.map(humanizeCategory).join(", ")
                      : t.gov.common.none}
                  </span>
                </span>

                {/*
                  Whether a department has a saved workflow is shown here
                  because a department without one cannot be assigned work —
                  it is the org head's cue to chase its head.
                */}
                <span
                  className={
                    dept.hasWorkflow
                      ? "shrink-0 rounded-full bg-civic-50 px-2.5 py-1 text-[0.6875rem] font-semibold text-civic-700"
                      : "shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[0.6875rem] font-semibold text-amber-700"
                  }
                >
                  {dept.hasWorkflow ? t.gov.org.workflowReady : t.gov.org.workflowMissing}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** A department chooser used by the routing inbox — kept here so both share one option shape. */
export function DeptSelect({
  depts,
  value,
  onChange,
  disabled,
  id,
}: {
  depts: DepartmentDto[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={t.gov.org.routeTo}
      className="min-h-12 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
    >
      <option value="">{t.gov.common.selectPlaceholder}</option>
      {depts.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.name}
        </option>
      ))}
    </select>
  );
}
