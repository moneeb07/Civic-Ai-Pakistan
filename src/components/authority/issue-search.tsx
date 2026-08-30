"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ISSUE_STATUSES, STATUS_LABELS } from "@/lib/authority/schema";
import { cn } from "@/lib/utils";

/*
 * Search and status filter, kept in the URL rather than in component state.
 *
 * An Issue ID is meant to be quoted and shared, so a filtered view has to
 * survive a copied link and a page reload — which query parameters give for
 * free and local state does not.
 */
export function IssueSearch({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = React.useState(params.get("q") ?? "");

  const status = params.get("status");

  function apply(next: { q?: string; status?: string | null }) {
    const query = new URLSearchParams(params.toString());

    if (next.q !== undefined) {
      if (next.q) query.set("q", next.q);
      else query.delete("q");
    }
    if (next.status !== undefined) {
      if (next.status) query.set("status", next.status);
      else query.delete("status");
    }

    const search = query.toString();
    router.push(search ? `${basePath}?${search}` : basePath);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: term.trim() });
        }}
        className="relative"
      >
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search by Issue ID, title or location — e.g. CIV-CDA-000001"
          aria-label="Search issues"
          className="ps-10"
        />
      </form>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={!status} onClick={() => apply({ status: null })}>
          All
        </FilterChip>
        {ISSUE_STATUSES.map((value) => (
          <FilterChip
            key={value}
            active={status === value}
            onClick={() => apply({ status: status === value ? null : value })}
          >
            {STATUS_LABELS[value]}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
        active
          ? "border-civic-600 bg-civic-600 text-white"
          : "border-line-strong bg-surface text-muted hover:border-civic-200 hover:bg-civic-50",
      )}
    >
      {children}
    </button>
  );
}
