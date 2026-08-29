import { AlertCircle } from "lucide-react";

/** Form-level failure (bad credentials, rate limit, network). Icon + text, never colour alone. */
export function FormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[var(--radius-field)] border border-danger/25 bg-danger-bg px-4 py-3"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="text-[0.875rem] leading-relaxed text-danger">{message}</p>
    </div>
  );
}
