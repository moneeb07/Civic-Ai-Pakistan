"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CIVIC_CATEGORIES } from "@/lib/report/schema";
import { categoryLabel } from "@/lib/authority/schema";
import { cn } from "@/lib/utils";

/*
 * Creating a department, and with it its routing rule.
 *
 * The category chips are not decoration — they ARE the configuration the
 * routing agent reads. Picking "Water leakage" here is what sends water
 * leakage reports to this department, with no code change. That is what keeps
 * the structure configurable instead of a hardcoded picture of one authority.
 */
export function CreateDepartmentForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/authority/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, categories }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't work.");
        setBusy(false);
        return;
      }

      setName("");
      setDescription("");
      setCategories([]);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="min-h-9 px-3 text-[0.8125rem]"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        New department
      </Button>
    );
  }

  return (
    <div className="w-full rounded-[18px] border border-line bg-surface p-4">
      <div className="space-y-2.5">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Department name — e.g. Street Lighting"
          aria-label="Department name"
        />
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What it covers (optional)"
          aria-label="Department description"
        />
      </div>

      <p className="mt-3 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Reports it receives
      </p>
      <p className="mt-1 text-[0.75rem] text-muted">
        New reports in these categories will be routed here automatically.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CIVIC_CATEGORIES.map((category) => {
          const on = categories.includes(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setCategories((current) =>
                  on ? current.filter((c) => c !== category) : [...current, category],
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors",
                on
                  ? "border-civic-600 bg-civic-100 text-civic-900"
                  : "border-line-strong bg-surface text-muted hover:bg-civic-50",
              )}
            >
              {categoryLabel(category)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          onClick={create}
          loading={busy}
          disabled={name.trim().length < 2}
          className="px-4 text-sm"
        >
          Create department
        </Button>
        <Button
          variant="secondary"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="px-4 text-sm"
        >
          Cancel
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
