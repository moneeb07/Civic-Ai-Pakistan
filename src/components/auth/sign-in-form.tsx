"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/civic/next-path";
import { describeNetworkError, describeSignInError } from "@/lib/auth-errors";
import { getDictionary } from "@/lib/i18n";
import { signInSchema, type SignInValues } from "@/lib/validation/auth";

const t = getDictionary();

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);

    try {
      const { error } = await signIn.email({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      if (error) {
        setFormError(describeSignInError(error));
        return;
      }

      // refresh() re-runs the server components so the new session is picked up.
      /*
       * Honour an explicit destination when one was requested (the landing
       * page's "Authority sign in" passes ?next=/authority), but only after
       * validating it — an unchecked value here is an open redirect.
       *
       * Without a destination we go to /dashboard, which itself forwards an
       * authority account to its workspace. So the routing is correct either
       * way; this just avoids a visible bounce.
       */
      router.push(safeNextPath(searchParams.get("next")) ?? "/dashboard");
      router.refresh();
    } catch {
      setFormError(describeNetworkError());
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError ? <FormAlert message={formError} /> : null}

      <FormField label={t.signIn.emailLabel} error={errors.email?.message}>
        {(field) => (
          <Input
            {...field}
            {...register("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t.signIn.emailPlaceholder}
            invalid={Boolean(errors.email)}
          />
        )}
      </FormField>

      <div className="space-y-2">
        <FormField label={t.signIn.passwordLabel} error={errors.password?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              {...register("password")}
              autoComplete="current-password"
              placeholder={t.signIn.passwordPlaceholder}
              invalid={Boolean(errors.password)}
            />
          )}
        </FormField>

        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="rounded text-[0.8125rem] font-medium text-civic-600 underline-offset-4 hover:underline"
          >
            {t.signIn.forgotPassword}
          </Link>
        </div>
      </div>

      <Button type="submit" size="full" loading={isSubmitting} className="mt-1">
        {isSubmitting ? t.signIn.submitting : t.signIn.submit}
      </Button>
    </form>
  );
}
