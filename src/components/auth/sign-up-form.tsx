"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { describeNetworkError, describeSignUpError } from "@/lib/auth-errors";
import { getDictionary } from "@/lib/i18n";
import { signUpSchema, type SignUpValues } from "@/lib/validation/auth";

const t = getDictionary();

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onBlur",
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  // Drives the strength meter only. The value never leaves the component except
  // in the sign-up call itself. `useWatch` (rather than `watch`) is the
  // subscription API the React Compiler can memoize safely.
  const password = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(values: SignUpValues) {
    setFormError(null);

    try {
      const { error } = await signUp.email({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      if (error) {
        setFormError(describeSignUpError(error));
        return;
      }

      // `autoSignIn` leaves the citizen authenticated, so go straight to /home.
      router.push("/home");
      router.refresh();
    } catch {
      setFormError(describeNetworkError());
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError ? <FormAlert message={formError} /> : null}

      <FormField label={t.signUp.nameLabel} error={errors.name?.message}>
        {(field) => (
          <Input
            {...field}
            {...register("name")}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder={t.signUp.namePlaceholder}
            invalid={Boolean(errors.name)}
          />
        )}
      </FormField>

      <FormField label={t.signUp.emailLabel} error={errors.email?.message}>
        {(field) => (
          <Input
            {...field}
            {...register("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t.signUp.emailPlaceholder}
            invalid={Boolean(errors.email)}
          />
        )}
      </FormField>

      <div className="space-y-2">
        <FormField
          label={t.signUp.passwordLabel}
          error={errors.password?.message}
          hint={t.signUp.passwordHint}
        >
          {(field) => (
            <PasswordInput
              {...field}
              {...register("password")}
              autoComplete="new-password"
              placeholder={t.signUp.passwordPlaceholder}
              invalid={Boolean(errors.password)}
            />
          )}
        </FormField>
        <PasswordStrength password={password} />
      </div>

      <FormField
        label={t.signUp.confirmPasswordLabel}
        error={errors.confirmPassword?.message}
      >
        {(field) => (
          <PasswordInput
            {...field}
            {...register("confirmPassword")}
            autoComplete="new-password"
            placeholder={t.signUp.confirmPasswordPlaceholder}
            invalid={Boolean(errors.confirmPassword)}
          />
        )}
      </FormField>

      <Button type="submit" size="full" loading={isSubmitting} className="mt-1">
        {isSubmitting ? t.signUp.submitting : t.signUp.submit}
      </Button>

      <p className="text-center text-[0.8125rem] leading-relaxed text-muted">
        {t.signUp.legal}
      </p>
    </form>
  );
}
