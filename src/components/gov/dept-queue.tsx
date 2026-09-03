"use client";

import { ClipboardList } from "lucide-react";

import { CardEyebrow } from "@/components/ui/card";
import { ComplaintCard } from "@/components/gov/complaint-card";
import { EmptyState } from "@/components/gov/states";
import type { ComplaintDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * The department head's queue.
 *
 * Assignment used to happen inline here with a single-person dropdown. It no
 * longer can: a complaint takes several people, and adding or removing them
 * belongs next to the stage controls and the discussion they affect. Every
 * card therefore opens the complaint, where AssigneeManager handles the whole
 * team, and carries a discussion icon straight to its group chat.
 */
export function DeptQueue({
  complaints,
  hasWorkflow,
}: {
  complaints: ComplaintDto[];
  hasWorkflow: boolean;
}) {
  if (complaints.length === 0) {
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

      {!hasWorkflow ? (
        <p className="mb-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-[0.8125rem] font-medium text-amber-800">
          {t.gov.dept.needsWorkflow}
        </p>
      ) : null}

      <ul className="space-y-2">
        {complaints.map((complaint) => (
          <li key={complaint.reportId}>
            <ComplaintCard
              complaint={complaint}
              href={`/gov/complaints/${complaint.reportId}`}
              chatHref={`/gov/complaints/${complaint.reportId}#chat`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
