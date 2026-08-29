"use client";

import * as React from "react";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardEyebrow } from "@/components/ui/card";
import { ComplaintCard } from "@/components/gov/complaint-card";
import { DeptSelect } from "@/components/gov/dept-manager";
import { EmptyState } from "@/components/gov/states";
import { useToast } from "@/components/gov/toast";
import * as api from "@/lib/gov/client";
import { GovApiError } from "@/lib/gov/client";
import type { ComplaintDto, DepartmentDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * The organization head's inbox: complaints citizens have confirmed that no
 * department owns yet.
 *
 * The AI routing service is a later ticket, so there is no suggestion to
 * accept — the note says so plainly rather than showing an empty "suggested
 * department" field that would read as a broken feature. The aiSuggested*
 * columns already exist for it and stay null.
 */
export function RoutingInbox({
  complaints,
  departments,
}: {
  complaints: ComplaintDto[];
  departments: DepartmentDto[];
}) {
  const toast = useToast();
  const [queue, setQueue] = React.useState(complaints);
  const [choices, setChoices] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function route(reportId: string) {
    const deptId = choices[reportId];
    if (!deptId) return;

    setBusyId(reportId);
    try {
      await api.routeComplaint(reportId, deptId);
      // Routed complaints leave this list — it is the *unrouted* inbox, and
      // leaving them would invite a second, failing route attempt.
      setQueue((current) => current.filter((item) => item.reportId !== reportId));
      toast.success(t.gov.org.routed);
    } catch (cause) {
      toast.error(cause instanceof GovApiError ? cause.message : t.gov.common.unexpectedError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <CardEyebrow className="mb-3 block">{t.gov.org.inboxEyebrow}</CardEyebrow>

      {queue.length === 0 ? (
        <EmptyState icon={Inbox} title={t.gov.org.noInboxTitle} body={t.gov.org.noInboxBody} />
      ) : (
        <ul className="space-y-2">
          {queue.map((complaint) => (
            <li key={complaint.reportId}>
              <ComplaintCard
                complaint={complaint}
                footer={
                  <div className="space-y-2">
                    <p className="text-[0.75rem] text-muted">
                      {t.gov.org.aiSuggestionUnavailable}
                    </p>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="flex-1">
                        <label
                          htmlFor={`route-${complaint.reportId}`}
                          className="sr-only"
                        >
                          {t.gov.org.routeTo}
                        </label>
                        <DeptSelect
                          id={`route-${complaint.reportId}`}
                          depts={departments}
                          value={choices[complaint.reportId] ?? ""}
                          onChange={(value) =>
                            setChoices((current) => ({ ...current, [complaint.reportId]: value }))
                          }
                          disabled={busyId === complaint.reportId}
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => route(complaint.reportId)}
                        disabled={!choices[complaint.reportId]}
                        loading={busyId === complaint.reportId}
                      >
                        {busyId === complaint.reportId ? t.gov.org.routing : t.gov.org.route}
                      </Button>
                    </div>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
