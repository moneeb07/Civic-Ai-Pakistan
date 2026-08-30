"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Search across the citizen's OWN reports.
 *
 * The filtering happens server-side over a list already scoped to this user,
 * so the search box can never widen what they are allowed to see — it only
 * narrows it. There is no query parameter here that reaches another citizen's
 * data.
 */
export function CitizenReportSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = React.useState(params.get("q") ?? "");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = term.trim();
        router.push(value ? `/dashboard/reports?q=${encodeURIComponent(value)}` : "/dashboard/reports");
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
        placeholder="Search your reports — Issue ID, place or title"
        aria-label="Search my reports"
        className="ps-10"
      />
    </form>
  );
}
