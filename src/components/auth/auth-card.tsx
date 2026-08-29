import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className={cn("w-full max-w-[26.5rem] animate-rise", className)}>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="mb-7">
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>

        {children}
      </div>

      {footer ? (
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      ) : null}
    </div>
  );
}
