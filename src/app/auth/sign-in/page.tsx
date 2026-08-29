import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getDictionary } from "@/lib/i18n";
import { redirectIfAuthenticated } from "@/lib/session";

const t = getDictionary();

export const metadata: Metadata = { title: t.signIn.title };

export default async function SignInPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <AuthCard
        title={t.signIn.title}
        subtitle={t.signIn.subtitle}
        footer={
          <>
            {t.signIn.noAccount}{" "}
            <Link
              href="/register"
              className="rounded font-semibold text-civic-600 underline-offset-4 hover:underline"
            >
              {t.signIn.createAccount}
            </Link>
          </>
        }
      >
        <SignInForm />
      </AuthCard>
    </AuthShell>
  );
}
