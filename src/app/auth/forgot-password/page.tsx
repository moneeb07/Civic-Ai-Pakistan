import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: t.forgotPassword.title };

/*
 * Honest placeholder. No email provider is connected in Stage 1, so rather than
 * showing a form that pretends to send a reset link, this states the position
 * plainly. The route exists so the sign-in link is not broken.
 */
export default function ForgotPasswordPage() {
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
