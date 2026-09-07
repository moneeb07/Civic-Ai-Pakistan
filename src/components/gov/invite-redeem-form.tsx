"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { GovField } from "@/components/gov/gov-field";
import { InlineError } from "@/components/gov/states";
import { extractInviteToken } from "@/lib/gov/invite-link";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

/*
 * The one self-service door into the government portal.
 *
 * An invited officer has a link in their email. Most of them will click it and
 * never see this box — it exists for the ones whose mail client mangled the
 * link, who are reading the invitation on a different device, or who copied
 * only the code from the end of it.
 *
 * All this does is FIND the token and navigate. Every real check — does this
 * invitation exist, has it expired, has it already been used — happens
 * server-side on the page it navigates to, and again when the account is
 * created. Getting a well-formed token past this box grants nothing; it just
 * saves the officer from being told "invalid link" by a page that never had a
 * token to look up in the first place.
 */
export function InviteRedeemForm() {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    const token = extractInviteToken(value);
    if (!token) {
      setError(t.gov.onboarding.tokenInvalid);
      return;
    }

    // Held true through the navigation so the button cannot be pressed twice.
    setBusy(true);
    setError(null);
    router.push(`/gov/invite/${token}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <GovField
        id="invite-link"
        label={t.gov.onboarding.tokenLabel}
        placeholder={t.gov.onboarding.tokenPlaceholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setValue(event.target.value);
          // Clear the complaint as soon as they start fixing it.
          if (error) setError(null);
        }}
      />

      {error ? (
        <div className="mt-3">
          <InlineError message={error} />
        </div>
      ) : null}

      <Button
        type="submit"
        size="full"
        className="mt-4"
        disabled={busy || value.trim().length === 0}
      >
        {t.gov.onboarding.tokenSubmit}
      </Button>
    </form>
  );
}
