"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/gov/confirm-dialog";
import { InlineError } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import type { AssigneeDto, OfficerDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * The people working a complaint.
 *
 * A department head can put several people on the same problem — the first
 * assignment starts the workflow, later ones join work already in progress.
 * Adding someone also puts them in the complaint's group chat, because
 * participation is derived from this list rather than managed separately.
 *
 * Removing the last remaining person is refused by the server; the button is
 * disabled here too, with the reason attached rather than left mysterious.
 */
export function AssigneeManager({
  reportId,
  initialAssignees,
  candidates,
  canManage,
}: {
  reportId: string;
  initialAssignees: AssigneeDto[];
  /** Members of the complaint's own department — the only people who may be assigned. */
  candidates: OfficerDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [assignees, setAssignees] = React.useState(initialAssignees);
  const [choice, setChoice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = React.useState<AssigneeDto | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const assignedIds = new Set(assignees.map((a) => a.officerId));
  const available = candidates.filter((c) => !assignedIds.has(c.id));

  async function add() {
    if (!choice) return;
    setBusy(true);
    setError(null);

    try {
      const result = await api.addAssignee(reportId, choice);
      setAssignees(result.assignees);
      setChoice("");
      toast.success(result.message);
      // The first assignment starts the workflow, which changes the stage
      // controls on this page — re-render from the server rather than guess.
      if (result.startedWorkflow) router.refresh();
    } catch (cause) {
      const message = cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);

    try {
      const result = await api.removeAssignee(reportId, pendingRemove.officerId);
      setAssignees(result.assignees);
      toast.success(result.message);
      setPendingRemove(null);
    } catch (cause) {
      toast.error(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setRemoving(false);
    }
  }

  const isLastAssignee = assignees.length === 1;

  return (
    <>
      <Card>
        <CardBody>
          <CardEyebrow>{t.gov.dept.assigneesEyebrow}</CardEyebrow>

          {assignees.length === 0 ? (
            <p className="mt-3 text-[0.9375rem] text-muted">{t.gov.complaint.notStarted}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {assignees.map((person) => (
                <li
                  key={person.officerId}
                  className="flex items-center gap-3 rounded-[14px] border border-line bg-canvas px-3 py-2.5"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                    <Users className="size-4" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-semibold text-ink">
                      {person.name}
                    </span>
                    <span className="block truncate text-[0.75rem] text-muted">
                      {t.gov.roles[person.role]}
                    </span>
                  </span>

                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setPendingRemove(person)}
                      disabled={isLastAssignee}
                      title={
                        isLastAssignee
                          ? t.gov.dept.cannotRemoveLastAssignee
                          : t.gov.dept.removeAssignee
                      }
                      aria-label={`${t.gov.dept.removeAssignee}: ${person.name}`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <UserMinus className="size-[18px]" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="mt-4">
              {error ? <InlineError message={error} /> : null}

              {available.length === 0 ? (
                <p className="text-[0.8125rem] text-muted">{t.gov.dept.noTeamBody}</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <label htmlFor="add-assignee" className="sr-only">
                      {t.gov.dept.addAssignee}
                    </label>
                    <select
                      id="add-assignee"
                      value={choice}
                      onChange={(event) => setChoice(event.target.value)}
                      disabled={busy}
                      className="min-h-12 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas"
                    >
                      <option value="">{t.gov.common.selectPlaceholder}</option>
                      {available.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} — {t.gov.roles[person.role]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button type="button" onClick={add} disabled={!choice} loading={busy}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    {assignees.length === 0 ? t.gov.dept.assign : t.gov.dept.addAssignee}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={t.gov.dept.removeAssignee}
        body={
          pendingRemove
            ? `${pendingRemove.name} will be taken off this complaint and will no longer see it or its discussion.`
            : ""
        }
        confirmLabel={t.gov.dept.removeAssignee}
        destructive
        busy={removing}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
