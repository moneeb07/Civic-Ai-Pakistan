import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { getRequestDictionary } from "@/lib/i18n/server";
import { en } from "@/lib/i18n/dictionaries/en";


/*
 * Page metadata reads the ENGLISH dictionary directly, and deliberately.
 * `metadata` is evaluated once per module, outside any request, so it cannot
 * see the citizen's cookie — and a browser tab title is closer to a bookmark
 * label than to instructional copy. Guessing at a language here would produce
 * one that is wrong for somebody; English is at least predictable.
 */
export const metadata: Metadata = { title: en.forgotPassword.title };

/*
 * Honest placeholder. No email provider is connected in Stage 1, so rather than
 * showing a form that pretends to send a reset link, this states the position
 * plainly. The route exists so the sign-in link is not broken.
 */
export default async function ForgotPasswordPage() {
  const t = await getRequestDictionary();
  return (
    <AuthShell>
      <AuthCard title={t.forgotPassword.title} subtitle={t.forgotPassword.subtitle}>
        <p className="text-[0.9375rem] leading-relaxed text-muted">
          {t.forgotPassword.body}
        </p>

        <Button asChild variant="secondary" size="full" className="mt-6">
          <Link href="/auth/sign-in">{t.forgotPassword.back}</Link>
        </Button>
      </AuthCard>
    </AuthShell>
  );
}
