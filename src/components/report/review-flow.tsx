"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, MapPinned, Pencil, ScanLine, ShieldCheck, Sparkles } from "lucide-react";

import { ReportStepHeading } from "@/components/report/report-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import {
  ReportApiError,
  confirmReport,
  generateComplaint,
  patchReport,
} from "@/lib/report/client";
import {
  CIVIC_CATEGORIES,
  SEVERITIES,
  type ReportDto,
  type Severity,
} from "@/lib/report/schema";


type Phase = "generating" | "generation-failed" | "review" | "confirmed";

/*
 * The most important screen in Stage 2: nothing generated here is ever
 * auto-submitted. Every AI-derived field is visibly labelled and editable,
 * and "Confirm Report" is the one and only action that can move a report to
 * ready_for_submission — see /api/reports/[id]/confirm, which does not
 * contact any government system, on purpose, for this stage.
 */
export function ReviewFlow({ initialReport }: { initialReport: ReportDto }) {
  const t = useT();
  const router = useRouter();
  const [report, setReport] = React.useState(initialReport);
  const [phase, setPhase] = React.useState<Phase>(
    initialReport.title && initialReport.description ? "review" : "generating",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [editing, setEditing] = React.useState<null | "title" | "description" | "location">(null);
  const [draft, setDraft] = React.useState("");

  const runGeneration = React.useCallback(async () => {
    setError(null);
    try {
      const updated = await generateComplaint(report.id);
      setReport(updated);
      setPhase("review");
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
      setPhase("generation-failed");
    }
  }, [report.id, t.report.unexpectedError]);

  /*
   * Auto-starts generation for a freshly-created report (no title yet) once
   * on mount. The call is deferred a tick via setTimeout rather than invoked
   * directly in the effect body — react-hooks/set-state-in-effect flags any
   * setState reachable synchronously from an effect, even through an async
   * function called with `void`, since its first microtask-free statement
   * still runs in the same tick. Deferring it is the same idiom
   * cnic-capture.tsx uses for its capture timer, for the same reason.
   */
  React.useEffect(() => {
    if (phase !== "generating" || report.title) return;

    const timeout = window.setTimeout(() => {
      void runGeneration();
    }, 0);

    return () => window.clearTimeout(timeout);
    // Only ever run once on mount for a report that hasn't been generated yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryGeneration() {
    setPhase("generating");
    void runGeneration();
  }

  async function saveEdit(field: "title" | "description" | "locationLabel", value: string) {
    if (!value.trim()) {
      setEditing(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await patchReport(report.id, { [field]: value.trim() } as Record<string, string>);
      setReport(updated);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  async function changeCategory(category: (typeof CIVIC_CATEGORIES)[number]) {
    setSubmitting(true);
    try {
      const updated = await patchReport(report.id, { category });
      setReport(updated);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  async function changeSeverity(severity: Severity) {
    setSubmitting(true);
    try {
      const updated = await patchReport(report.id, { severity });
      setReport(updated);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await confirmReport(report.id);
      setReport(updated);
      setPhase("confirmed");
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "generating") {
    return (
      <>
        <ReportStepHeading title={t.report.generatingTitle} subtitle={t.report.generatingBody} />
        <div className="rounded-[20px] border border-line bg-surface p-10 text-center" role="status" aria-live="polite">
          <span className="relative mx-auto flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-civic-100 opacity-75" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-civic-100">
              <Sparkles className="size-7 text-civic-700" aria-hidden="true" />
            </span>
          </span>
        </div>
      </>
    );
  }

  if (phase === "generation-failed") {
    return (
      <>
        <ReportStepHeading title={t.report.generationFailedTitle} />
        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex flex-col gap-2.5">
          <Button size="full" onClick={retryGeneration}>
            {t.report.tryAgain}
          </Button>
          <Button variant="secondary" size="full" onClick={() => setPhase("review")}>
            {t.report.editManually}
          </Button>
        </div>
      </>
    );
  }

  if (phase === "confirmed") {
    return (
      <>
        <div className="rounded-[20px] border border-civic-200 bg-civic-50 p-8 text-center">
          <ShieldCheck className="mx-auto size-10 text-civic-700" aria-hidden="true" />
          <h1 className="mt-4 text-[1.375rem] font-semibold text-civic-900">{t.report.reportReadyTitle}</h1>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-civic-900/70">{t.report.reportReadyBody}</p>
        </div>
        <Button size="full" className="mt-6" onClick={() => router.push("/dashboard")}>
          {t.dashboard.navHome}
        </Button>
      </>
    );
  }

  // -- review -----------------------------------------------------------------
  return (
    <>
      <ReportStepHeading title={t.report.reviewTitle} subtitle={t.report.reviewSubtitle} />
      {error ? <ErrorBanner message={error} /> : null}

      <div className="space-y-4">
        {/* Evidence */}
        {report.hasImage ? (
          <section className="overflow-hidden rounded-[18px] border border-line bg-surface">
            <p className="px-4 pt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {t.report.evidenceSection}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/reports/${report.id}/image`} alt="" className="mt-3 w-full" />
          </section>
        ) : null}

        {/* Category */}
        <section className="rounded-[18px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {t.report.issueSection}
            </p>
            {report.categorySource === "ai" ? <AiBadge /> : null}
          </div>
          <select
            value={report.category ?? ""}
            onChange={(event) => changeCategory(event.target.value as (typeof CIVIC_CATEGORIES)[number])}
            disabled={submitting}
            className="mt-2 w-full rounded-[12px] border border-line-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-ink"
          >
            {CIVIC_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t.report.categories[category]}
              </option>
            ))}
          </select>
        </section>

        {/* Title */}
        <EditableSection
          label={t.report.titleField}
          value={report.title ?? ""}
          source={report.titleSource}
          editing={editing === "title"}
          onEdit={() => {
            setDraft(report.title ?? "");
            setEditing("title");
          }}
          onCancel={() => setEditing(null)}
          onSave={() => saveEdit("title", draft)}
          draft={draft}
          onDraftChange={setDraft}
          submitting={submitting}
          multiline={false}
        />

        {/* Description */}
        <EditableSection
          label={t.report.descriptionField}
          value={report.description ?? ""}
          source={report.descriptionSource}
          editing={editing === "description"}
          onEdit={() => {
            setDraft(report.description ?? "");
            setEditing("description");
          }}
          onCancel={() => setEditing(null)}
          onSave={() => saveEdit("description", draft)}
          draft={draft}
          onDraftChange={setDraft}
          submitting={submitting}
          multiline
        />

        {/* Severity */}
        <section className="rounded-[18px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {t.report.severityField}
            </p>
            {report.severitySource === "ai" ? <AiBadge /> : null}
          </div>
          <p className="mt-1 text-[0.75rem] text-muted">{t.report.severityHint}</p>
          <div className="mt-3 flex gap-2">
            {SEVERITIES.map((severity) => {
              const selected = report.severity === severity;
              return (
                <button
                  key={severity}
                  type="button"
                  onClick={() => changeSeverity(severity)}
                  disabled={submitting}
                  className={
                    selected
                      ? "min-h-11 flex-1 rounded-[var(--radius-field)] border-2 border-civic-600 bg-civic-50 text-[0.875rem] font-semibold text-civic-700"
                      : "min-h-11 flex-1 rounded-[var(--radius-field)] border border-line-strong bg-surface text-[0.875rem] text-ink transition-colors hover:border-civic-200"
                  }
                >
                  {t.report.severities[severity]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Location */}
        <section className="rounded-[18px] border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <MapPinned className="mt-0.5 size-4 shrink-0 text-civic-600" aria-hidden="true" />
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                  {t.report.locationLabel}
                </p>
                {editing === "location" ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      dir="auto"
                      className="min-h-10"
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-[0.9375rem] text-ink">
                    {report.locationLabel ??
                      (report.latitude !== null
                        ? `${report.latitude.toFixed(5)}, ${report.longitude?.toFixed(5)}`
                        : t.profile.notProvided)}
                  </p>
                )}
              </div>
            </div>
            {editing === "location" ? (
              <div className="flex gap-1">
                <Button size="default" className="min-h-9 px-3 text-[0.8125rem]" loading={submitting} onClick={() => saveEdit("locationLabel", draft)}>
                  {t.report.save}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(report.locationLabel ?? "");
                  setEditing("location");
                }}
                className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-canvas hover:text-civic-700"
                aria-label={t.report.edit}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      </div>

      <Button size="full" className="mt-7" onClick={confirm} loading={submitting}>
        {t.report.confirmReport}
      </Button>
    </>
  );
}

function AiBadge() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-civic-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-civic-700">
      <ScanLine className="size-3" aria-hidden="true" />
      {t.report.aiGenerated}
    </span>
  );
}

function EditableSection({
  label,
  value,
  source,
  editing,
  onEdit,
  onCancel,
  onSave,
  draft,
  onDraftChange,
  submitting,
  multiline,
}: {
  label: string;
  value: string;
  source: "ai" | "manual" | null;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  submitting: boolean;
  multiline: boolean;
}) {
  const t = useT();
  return (
    <section className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        {source === "ai" && !editing ? <AiBadge /> : null}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              rows={4}
              dir="auto"
              className="w-full rounded-[12px] border border-line-strong bg-surface p-3 text-[0.9375rem] leading-relaxed text-ink outline-none focus-visible:border-civic-600"
            />
          ) : (
            <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} dir="auto" className="min-h-10" />
          )}
          <div className="flex gap-2">
            <Button size="default" className="min-h-9 px-3 text-[0.8125rem]" loading={submitting} onClick={onSave}>
              {t.report.save}
            </Button>
            <Button variant="secondary" size="default" className="min-h-9 px-3 text-[0.8125rem]" onClick={onCancel} disabled={submitting}>
              {t.identity.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-start justify-between gap-3">
          <p dir="auto" className="text-[0.9375rem] leading-relaxed text-ink">
            {value || t.profile.notProvided}
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-canvas hover:text-civic-700"
            aria-label={t.report.edit}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="text-[0.875rem] text-danger">{message}</p>
    </div>
  );
}
