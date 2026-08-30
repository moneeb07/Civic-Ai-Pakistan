"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/authority/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ISSUE_STATUSES, STATUS_LABELS, type IssueStatus } from "@/lib/authority/schema";
import { cn } from "@/lib/utils";

/*
 * Moving an issue between the three stages.
 *
 * Any member with access to the issue may do this — there is no rank gate,
 * which is deliberate. What replaces a hierarchy is a record: every change is
 * appended to the status history with the member's name against it, so
 * accountability comes from the log rather than from permissions.
 */
export function StatusControl({
  issueCode,
  status,
}: {
  issueCode: string;
  status: IssueStatus;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<IssueStatus>(status);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const changed = selected !== status;

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/authority/issues/${issueCode}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selected, note }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't work. Please try again.");
        setBusy(false);
        return;
      }

      setNote("");
      // The history, the badge and the dashboards all move together.
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
          Current status
        </p>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ISSUE_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSelected(value)}
            aria-pressed={selected === value}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              selected === value
                ? "border-civic-600 bg-civic-600 text-white"
                : "border-line-strong bg-surface text-muted hover:border-civic-200 hover:bg-civic-50",
            )}
          >
            {STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {changed ? (
        <div className="mt-3 space-y-2.5">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note for the history — what changed and why (optional)"
            aria-label="Status note"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} loading={busy} className="px-4 text-sm">
              Update to {STATUS_LABELS[selected]}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSelected(status);
                setNote("");
                setError(null);
              }}
              disabled={busy}
              className="px-4 text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
