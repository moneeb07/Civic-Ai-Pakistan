"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import { workflowSchema, type WorkflowDto, type WorkflowStageValues } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * The department's resolution workflow.
 *
 * Reordering is native HTML5 drag-and-drop plus explicit up/down buttons — no
 * library. The buttons are not a fallback: drag-and-drop is unusable with a
 * keyboard and awkward on a phone, so the buttons are the accessible path and
 * the drag is the convenience.
 *
 * Validation is the SAME Zod schema the PUT route runs, so the inline errors
 * an officer sees are exactly the conditions the server will enforce — there
 * is no way to see a green form and get a red response.
 */

interface DraftStage extends WorkflowStageValues {
  /** Stable key for React across reorders — the DB id, or a local one for new rows. */
  key: string;
}

function toDrafts(workflow: WorkflowDto): DraftStage[] {
  return workflow.stages.map((stage) => ({
    key: stage.id,
    id: workflow.isTemplate ? undefined : stage.id,
    name: stage.name,
    description: stage.description,
    requiresPhoto: stage.requiresPhoto,
    requiresNote: stage.requiresNote,
    slaHours: stage.slaHours,
    isTerminal: stage.isTerminal,
  }));
}

export function WorkflowBuilder({ deptId, initial }: { deptId: string; initial: WorkflowDto }) {
  const toast = useToast();
  const [stages, setStages] = React.useState<DraftStage[]>(() => toDrafts(initial));
  const [isTemplate, setIsTemplate] = React.useState(initial.isTemplate);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const localKey = React.useRef(0);

  /*
   * A freshly seeded template counts as dirty from the start: it has never
   * been saved, so "Save changes" must be reachable without the dept head
   * having to edit something first just to enable the button.
   */
  const [dirty, setDirty] = React.useState(initial.isTemplate);

  /*
   * Validated with the SAME schema the PUT route runs, so an officer can never
   * see a valid form and get a rejection from the server.
   *
   * `key` is stripped here: it is a React identity for reordering, not part of
   * the contract, and sending it would fail the schema's strict shape.
   */
  const { parsed, stageErrors, workflowErrors } = React.useMemo(() => {
    const result = workflowSchema.safeParse({
      stages: stages.map((stage) => {
        const { key, ...rest } = stage;
        void key;
        return rest;
      }),
    });

    const issues = result.success ? [] : result.error.issues;

    // Errors belonging to one stage's field, keyed "index:field", so each
    // message renders beside the input it is about.
    const byStage = new Map<string, string>();
    for (const issue of issues) {
      if (issue.path[0] === "stages" && typeof issue.path[1] === "number") {
        byStage.set(`${issue.path[1]}:${issue.path[2] ?? ""}`, issue.message);
      }
    }

    // Errors about the workflow as a whole — no terminal stage, and so on.
    const whole = issues
      .filter((issue) => issue.path.length <= 1 || typeof issue.path[1] !== "number")
      .map((issue) => issue.message);

    return { parsed: result, stageErrors: byStage, workflowErrors: whole };
  }, [stages]);

  function update(index: number, patch: Partial<DraftStage>) {
    setStages((current) =>
      current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)),
    );
    setDirty(true);
  }

  /** Exactly one terminal stage: selecting one clears the others, like a radio group. */
  function setTerminal(index: number) {
    setStages((current) => current.map((stage, i) => ({ ...stage, isTerminal: i === index })));
    setDirty(true);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= stages.length || from === to) return;
    setStages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  }

  function addStage() {
    setStages((current) => [
      ...current,
      {
        key: `new-${localKey.current++}`,
        name: "",
        description: null,
        requiresPhoto: false,
        requiresNote: false,
        slaHours: null,
        isTerminal: false,
      },
    ]);
    setDirty(true);
  }

  /*
   * Deletion is blocked at the two boundaries the schema also enforces, and
   * the button says why rather than silently doing nothing.
   */
  function deleteReason(index: number): string | null {
    const stage = stages[index];
    const terminals = stages.filter((s) => s.isTerminal).length;

    if (stage.isTerminal && terminals <= 1) return t.gov.workflow.cannotDeleteLastTerminal;
    if (!stage.isTerminal && stages.length - terminals <= 1) {
      return t.gov.workflow.cannotDeleteLastActive;
    }
    return null;
  }

  function removeStage(index: number) {
    if (deleteReason(index)) return;
    setStages((current) => current.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function save() {
    if (!parsed.success) return;

    setSaving(true);
    setError(null);

    try {
      const saved = await api.saveWorkflow(deptId, parsed.data);
      setStages(toDrafts(saved));
      setIsTemplate(false);
      setDirty(false);
      toast.success(t.gov.workflow.saved);
    } catch (cause) {
      const message = cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-[0.8125rem] font-medium text-muted"
          role="status"
          aria-live="polite"
        >
          {dirty ? t.gov.workflow.unsaved : t.gov.workflow.noChanges} · {stages.length}{" "}
          {t.gov.workflow.stageCount}
        </p>

        <Button type="button" onClick={save} disabled={!dirty || !parsed.success} loading={saving}>
          {saving ? t.gov.workflow.saving : t.gov.workflow.save}
        </Button>
      </div>

      {isTemplate ? (
        <div className="mb-5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-[0.8125rem] font-semibold text-amber-800">
            {t.gov.workflow.templateBadge}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-snug text-amber-900/80">
            {t.gov.workflow.templateNote}
          </p>
        </div>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      {workflowErrors.length > 0 ? (
        <div role="alert" className="mb-5 space-y-1">
          {workflowErrors.map((message) => (
            <InlineError key={message} message={message} />
          ))}
        </div>
      ) : null}

      <ol className="space-y-3">
        {stages.map((stage, index) => (
          <li
            key={stage.key}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn(dragIndex === index && "opacity-60")}
          >
            <Card>
              <CardBody className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-2 hidden cursor-grab text-muted sm:block"
                    aria-hidden="true"
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-[0.75rem] font-semibold text-muted">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <Label htmlFor={`stage-name-${stage.key}`} className="sr-only">
                          {t.gov.workflow.stageName}
                        </Label>
                        <Input
                          id={`stage-name-${stage.key}`}
                          value={stage.name}
                          placeholder={t.gov.workflow.stageNamePlaceholder}
                          invalid={stageErrors.has(`${index}:name`)}
                          onChange={(event) => update(index, { name: event.target.value })}
                        />
                        {stageErrors.get(`${index}:name`) ? (
                          <p role="alert" className="mt-1.5 text-[0.8125rem] font-medium text-danger">
                            {stageErrors.get(`${index}:name`)}
                          </p>
                        ) : null}
                      </div>

                      {/* Reorder controls: the keyboard-accessible path. */}
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          aria-label={`${t.gov.workflow.moveUp}: ${stage.name || index + 1}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-35"
                        >
                          <ChevronUp className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, index + 1)}
                          disabled={index === stages.length - 1}
                          aria-label={`${t.gov.workflow.moveDown}: ${stage.name || index + 1}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-35"
                        >
                          <ChevronDown className="size-4" aria-hidden="true" />
                        </button>
                      </div>

                      <DeleteStageButton
                        reason={deleteReason(index)}
                        label={stage.name || `${index + 1}`}
                        onDelete={() => removeStage(index)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`stage-desc-${stage.key}`} className="sr-only">
                        {t.gov.workflow.stageDescription}
                      </Label>
                      <Input
                        id={`stage-desc-${stage.key}`}
                        value={stage.description ?? ""}
                        placeholder={t.gov.workflow.stageDescriptionPlaceholder}
                        onChange={(event) =>
                          update(index, { description: event.target.value || null })
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      <Toggle
                        id={`stage-photo-${stage.key}`}
                        label={t.gov.workflow.requiresPhoto}
                        checked={stage.requiresPhoto}
                        onChange={(checked) => update(index, { requiresPhoto: checked })}
                      />
                      <Toggle
                        id={`stage-note-${stage.key}`}
                        label={t.gov.workflow.requiresNote}
                        checked={stage.requiresNote}
                        onChange={(checked) => update(index, { requiresNote: checked })}
                      />

                      <div className="flex items-center gap-2">
                        <Label htmlFor={`stage-sla-${stage.key}`} className="text-muted">
                          {t.gov.workflow.slaLabel}
                        </Label>
                        <input
                          id={`stage-sla-${stage.key}`}
                          type="number"
                          min={1}
                          max={8760}
                          inputMode="numeric"
                          value={stage.slaHours ?? ""}
                          placeholder={t.gov.workflow.slaPlaceholder}
                          onChange={(event) =>
                            update(index, {
                              slaHours: event.target.value ? Number(event.target.value) : null,
                            })
                          }
                          className="min-h-10 w-20 rounded-[var(--radius-field)] border border-line-strong bg-surface px-3 text-[0.875rem] text-ink transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20"
                        />
                        <span className="text-[0.8125rem] text-muted">
                          {t.gov.workflow.slaSuffix}
                        </span>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 text-[0.875rem] font-medium text-ink">
                        <input
                          type="radio"
                          name="terminal-stage"
                          checked={stage.isTerminal}
                          onChange={() => setTerminal(index)}
                          className="size-4 accent-civic-600"
                        />
                        {t.gov.workflow.terminalLabel}
                      </label>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <Button type="button" variant="secondary" onClick={addStage} className="mt-4">
        {t.gov.workflow.addStage}
      </Button>
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-[0.875rem] font-medium text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-civic-600"
      />
      {label}
    </label>
  );
}

/** Disabled with the reason attached, rather than removed — the rule is visible, not mysterious. */
function DeleteStageButton({
  reason,
  label,
  onDelete,
}: {
  reason: string | null;
  label: string;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={reason !== null}
      title={reason ?? t.gov.workflow.deleteStage}
      aria-label={`${t.gov.workflow.deleteStage}: ${label}`}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      <Trash2 className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
