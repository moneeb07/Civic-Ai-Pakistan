import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getRequestDictionary } from "@/lib/i18n/server";
import { en } from "@/lib/i18n/dictionaries/en";
import { redirectIfAuthenticated } from "@/lib/session";


/*
 * Page metadata reads the ENGLISH dictionary directly, and deliberately.
 * `metadata` is evaluated once per module, outside any request, so it cannot
 * see the citizen's cookie — and a browser tab title is closer to a bookmark
 * label than to instructional copy. Guessing at a language here would produce
 * one that is wrong for somebody; English is at least predictable.
 */
export const metadata: Metadata = { title: en.signIn.title };

export default async function SignInPage() {
  const t = await getRequestDictionary();
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
