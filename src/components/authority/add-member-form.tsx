"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/*
 * Adding a member to a department.
 *
 * There is no rank to choose, because there are no ranks — only whether
 * someone administers the authority or works a department's issues. Everything
 * else about what they can do is identical.
 */
export function AddMemberForm({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{
    memberCode: string;
    temporaryPassword: string | null;
  } | null>(null);

  async function add() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/authority/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          departmentId,
          accessType: "department_member",
        }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setError(payload.message ?? "That didn't work.");
        setBusy(false);
        return;
      }

      setIssued(payload.data);
      setName("");
      setEmail("");
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
        className="min-h-9 w-full px-3 text-[0.8125rem]"
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        Add member
      </Button>
    );
  }

  return (
    <div className="rounded-[14px] border border-line bg-canvas p-3">
      <div className="space-y-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Full name"
          aria-label="Member name"
        />
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Work email"
          aria-label="Member email"
        />
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button
          onClick={add}
          loading={busy}
          disabled={name.trim().length < 2 || !email.includes("@")}
          className="min-h-10 px-3 text-[0.8125rem]"
        >
          Add
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setIssued(null);
            setError(null);
          }}
          disabled={busy}
          className="min-h-10 px-3 text-[0.8125rem]"
        >
          Close
        </Button>
      </div>

      {/*
        Shown once and never again — the server does not keep it. With no email
        provider wired up, handing the admin the credential to pass on is the
        honest option; pretending an invitation email was sent would not be.
      */}
      {issued ? (
        <div className="mt-2.5 rounded-[12px] border border-civic-200 bg-civic-50 p-2.5">
          <p className="text-[0.8125rem] font-semibold text-civic-900">
            Added as {issued.memberCode}
          </p>
          {issued.temporaryPassword ? (
            <>
              <p className="mt-1 text-[0.75rem] text-civic-900/80">
                Give them this one-time password. It is not shown again.
              </p>
              <p className="mt-1 font-mono text-[0.8125rem] font-semibold text-civic-900">
                {issued.temporaryPassword}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[0.75rem] text-civic-900/80">
              They already had a CivicAI account and can sign in with it.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
