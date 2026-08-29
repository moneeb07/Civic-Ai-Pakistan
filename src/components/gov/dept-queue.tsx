"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardEyebrow } from "@/components/ui/card";
import { ComplaintCard } from "@/components/gov/complaint-card";
import { EmptyState } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import type { ComplaintDto, OfficerDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * The department head's queue.
 *
 * Unassigned complaints get an inline assignee picker; assigned ones are just
 * links to the detail page. The picker is disabled outright when the
 * department has no saved workflow, with the reason shown — a complaint
 * cannot enter a process that does not exist, and the server refuses it too.
 */
export function DeptQueue({
  complaints,
  members,
  hasWorkflow,
}: {
  complaints: ComplaintDto[];
  members: OfficerDto[];
  hasWorkflow: boolean;
}) {
  const toast = useToast();
  const [queue, setQueue] = React.useState(complaints);
  const [choices, setChoices] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function assign(reportId: string) {
    const officerId = choices[reportId];
    if (!officerId) return;

    setBusyId(reportId);
    try {
      await api.assignComplaint(reportId, officerId);

      const assignee = members.find((member) => member.id === officerId);
      setQueue((current) =>
        current.map((item) =>
          item.reportId === reportId && item.assignment
            ? {
                ...item,
                assignment: {
                  ...item.assignment,
                  assignedOfficerId: officerId,
                  assignedOfficerName: assignee?.name ?? null,
                },
              }
            : item,
        ),
      );
      toast.success(t.gov.dept.assigned);
    } catch (cause) {
      toast.error(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <section>
        <CardEyebrow className="mb-3 block">{t.gov.dept.queueEyebrow}</CardEyebrow>
        <EmptyState
          icon={ClipboardList}
          title={t.gov.dept.noQueueTitle}
          body={t.gov.dept.noQueueBody}
        />
      </section>
    );
  }

  return (
    <section>
      <CardEyebrow className="mb-3 block">{t.gov.dept.queueEyebrow}</CardEyebrow>

      <ul className="space-y-2">
        {queue.map((complaint) => {
          const unassigned = !complaint.assignment?.assignedOfficerId;

          return (
            <li key={complaint.reportId}>
              <ComplaintCard
                complaint={complaint}
                href={unassigned ? undefined : `/gov/complaints/${complaint.reportId}`}
                footer={
                  unassigned ? (
                    <div className="space-y-2">
                      {!hasWorkflow ? (
                        <p className="text-[0.75rem] font-medium text-amber-700">
                          {t.gov.dept.needsWorkflow}
                        </p>
                      ) : null}

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="flex-1">
                          <label htmlFor={`assign-${complaint.reportId}`} className="sr-only">
                            {t.gov.dept.assignTo}
                          </label>
                          <select
                            id={`assign-${complaint.reportId}`}
                            value={choices[complaint.reportId] ?? ""}
                            onChange={(event) =>
                              setChoices((current) => ({
                                ...current,
                                [complaint.reportId]: event.target.value,
                              }))
                            }
                            disabled={!hasWorkflow || busyId === complaint.reportId}
                            className="min-h-12 w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted"
                          >
                            <option value="">{t.gov.common.selectPlaceholder}</option>
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name} — {t.gov.roles[member.role]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <Button
                          type="button"
                          onClick={() => assign(complaint.reportId)}
                          disabled={!hasWorkflow || !choices[complaint.reportId]}
                          loading={busyId === complaint.reportId}
                        >
                          {busyId === complaint.reportId
                            ? t.gov.dept.assigning
                            : t.gov.dept.assign}
                        </Button>
                      </div>
                    </div>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
