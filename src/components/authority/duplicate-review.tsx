"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Split } from "lucide-react";

import { Button } from "@/components/ui/button";

/*
 * A member's verdict on an uncertain grouping.
 *
 * This is the human half of "never merge blindly". The agent says what it is
 * unsure about and why; a person who knows the street decides. Splitting does
 * not delete the citizen's report — it detaches it, and the next intake pass
 * gives it an issue of its own.
 */
export function DuplicateReview({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"confirm" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: "confirm" | "reject") {
    setBusy(decision);
    setError(null);

    try {
      const response = await fetch(`/api/authority/links/${linkId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't work.");
        setBusy(null);
        return;
      }

      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => decide("confirm")}
          loading={busy === "confirm"}
          disabled={busy !== null}
          className="min-h-10 px-3 text-[0.8125rem]"
        >
          {busy !== "confirm" ? <Check className="size-3.5" aria-hidden="true" /> : null}
          Same problem
        </Button>
        <Button
          variant="secondary"
          onClick={() => decide("reject")}
          loading={busy === "reject"}
          disabled={busy !== null}
          className="min-h-10 px-3 text-[0.8125rem]"
        >
          {busy !== "reject" ? <Split className="size-3.5" aria-hidden="true" /> : null}
          Different problem — split it out
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
