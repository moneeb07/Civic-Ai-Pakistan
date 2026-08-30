import { cn } from "@/lib/utils";
import type { AuthorityStats } from "@/lib/authority/queries";

/*
 * The dashboard headline.
 *
 * The first two tiles are deliberately adjacent and deliberately different
 * numbers: "120 citizen reports" beside "65 civic issues" is the single
 * clearest statement of what CivicAI does — it turns a pile of reports into a
 * list of problems. The tiles below break that down.
 */
function Tile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "primary" | "red" | "amber" | "green";
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border p-4",
        tone === "primary"
          ? "border-civic-200 bg-civic-50"
          : tone === "red"
            ? "border-danger/20 bg-danger-bg"
            : tone === "amber"
              ? "border-amber-200 bg-amber-50"
              : tone === "green"
                ? "border-civic-200 bg-civic-50/60"
                : "border-line bg-surface",
      )}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-[1.75rem] font-bold leading-none",
          tone === "red" ? "text-danger" : tone === "amber" ? "text-amber-800" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatGrid({ stats }: { stats: AuthorityStats }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          label="Citizen reports"
          value={stats.citizenReports}
          hint="Individual submissions from the public. Every one is kept."
          tone="default"
        />
        <Tile
          label="Underlying civic issues"
          value={stats.civicIssues}
          hint="Distinct real-world problems, after grouping duplicate reports."
          tone="primary"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Reported" value={stats.reported} tone="red" />
        <Tile label="In process" value={stats.inProcess} tone="amber" />
        <Tile label="Resolved" value={stats.resolved} tone="green" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Duplicates grouped"
          value={stats.groupedDuplicates}
          hint="Reports the agent attached to an existing issue."
        />
        <Tile
          label="Awaiting review"
          value={stats.awaitingReview}
          hint="Uncertain matches. Grouped provisionally, never silently."
        />
        <Tile
          label="Unrouted"
          value={stats.unrouted}
          hint="No department handles this category yet."
        />
      </div>
    </div>
  );
}
