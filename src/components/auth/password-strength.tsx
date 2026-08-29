"use client";

import { assessPasswordStrength } from "@/lib/validation/auth";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

const PRESENTATION = {
  weak: { filled: 1, bar: "bg-danger", text: "text-danger", label: t.passwordStrength.weak },
  fair: { filled: 2, bar: "bg-amber-500", text: "text-amber-700", label: t.passwordStrength.fair },
  strong: { filled: 3, bar: "bg-civic-500", text: "text-civic-600", label: t.passwordStrength.strong },
} as const;

/*
 * Advisory only — this never blocks submission. The actual policy lives in
 * `passwordSchema` and is enforced on the server.
 */
export function PasswordStrength({ password }: { password: string }) {
  const strength = assessPasswordStrength(password);

  if (strength === "empty") return null;

  const { filled, bar, text, label } = PRESENTATION[strength];

  return (
    <div className="pt-0.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-200",
                index < filled ? bar : "bg-line-strong",
              )}
            />
          ))}
        </div>
        <span className={cn("text-[0.75rem] font-semibold", text)}>{label}</span>
      </div>
      {/* Announced politely so it does not interrupt typing. */}
      <p className="sr-only" aria-live="polite">
        {t.passwordStrength.label}: {label}
      </p>
    </div>
  );
}
