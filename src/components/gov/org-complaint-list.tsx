"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";

import { CardEyebrow } from "@/components/ui/card";
import { ComplaintCard } from "@/components/gov/complaint-card";
import { EmptyState } from "@/components/gov/states";
import type { ComplaintDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * Everything happening in the organization, for its head.
 *
 * Each card carries a discussion icon straight into that complaint's group
 * chat — the organization head is a participant in every one of them, because
 * they are the person who routed it.
 *
 * The filter chips are how this stays usable on a phone at 360px and usable at
 * all once an organization has a few hundred complaints. Filtering is
 * client-side over an already-scoped list: the server has already limited this
 * to one organization, so narrowing it further is a display concern, not an
 * access one.
 */

type Filter = "all" | "unassigned" | "in_progress" | "resolved" | "attention";

export function OrgComplaintList({ complaints }: { complaints: ComplaintDto[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts = React.useMemo(() => {
    const c: Record<Filter, number> = {
      all: complaints.length,
      unassigned: 0,
      in_progress: 0,
      resolved: 0,
      attention: 0,
    };
    for (const complaint of complaints) {
      const a = complaint.assignment;
      if (!a || a.assignees.length === 0) c.unassigned++;
      else if (a.isResolved) c.resolved++;
      else c.in_progress++;
      if (complaint.needsAttention) c.attention++;
    }
    return c;
  }, [complaints]);

  const visible = React.useMemo(() => {
    if (filter === "all") return complaints;
    return complaints.filter((complaint) => {
      const a = complaint.assignment;
      switch (filter) {
        case "unassigned":
          return !a || a.assignees.length === 0;
        case "in_progress":
          return Boolean(a) && a!.assignees.length > 0 && !a!.isResolved;
        case "resolved":
          return Boolean(a?.isResolved);
        case "attention":
          return complaint.needsAttention;
      }
    });
  }, [complaints, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unassigned", label: t.gov.dept.unassigned },
    { key: "in_progress", label: "In progress" },
    { key: "resolved", label: t.gov.complaint.resolvedBadge },
    { key: "attention", label: t.gov.dept.needsAttention },
  ];

  if (complaints.length === 0) {
    return (
      <section>
        <CardEyebrow className="mb-3 block">{t.gov.org.allComplaintsEyebrow}</CardEyebrow>
        <EmptyState
          icon={ClipboardList}
          title={t.gov.org.noComplaintsTitle}
          body={t.gov.org.noComplaintsBody}
        />
      </section>
    );
  }

  return (
    <section>
      <CardEyebrow className="mb-3 block">{t.gov.org.allComplaintsEyebrow}</CardEyebrow>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter complaints">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            aria-pressed={filter === chip.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              filter === chip.key
                ? "border-civic-200 bg-civic-50 text-civic-700"
                : "border-line-strong bg-surface text-muted hover:border-civic-200",
            )}
          >
            {chip.label}
            <span className="opacity-70">{counts[chip.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-[0.875rem] text-muted">
          Nothing matches this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((complaint) => (
            <li key={complaint.reportId}>
              <ComplaintCard
                complaint={complaint}
                href={`/gov/complaints/${complaint.reportId}`}
                chatHref={`/gov/complaints/${complaint.reportId}#chat`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
