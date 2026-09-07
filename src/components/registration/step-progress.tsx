"use client";

/*
 * A client component purely so it can read the citizen's language.
 * It fetches nothing and holds no state — but it IS imported by client
 * components, so it cannot be an async server component, and the
 * dictionary has to come from the context rather than from cookies().
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import type { Dictionary } from "@/lib/i18n";
import type { RegistrationStep } from "@/lib/registration/schema";


/*
 * Six visible groups. "review" is folded into Identity because, to the citizen,
 * scanning a card and checking what was read are one task.
 */
function groupsFor(t: Dictionary): { key: string; steps: RegistrationStep[]; label: string }[] {
  return [
    { key: "identity", steps: ["identity", "review"], label: t.registration.steps.identity },
    { key: "contact", steps: ["contact"], label: t.registration.steps.contact },
    { key: "security", steps: ["security"], label: t.registration.steps.security },
    { key: "address", steps: ["address"], label: t.registration.steps.address },
    { key: "photo", steps: ["photo"], label: t.registration.steps.photo },
    { key: "confirm", steps: ["confirm"], label: t.registration.steps.review },
  ];
}

export function StepProgress({ current }: { current: RegistrationStep }) {
  const t = useT();
  const GROUPS = groupsFor(t);
  const activeIndex = GROUPS.findIndex((group) => group.steps.includes(current));

  return (
    <nav aria-label={t.registration.progressLabel} className="w-full">
      {/* Numeric position — the fastest way to answer "where am I?". */}
      <p className="mb-3 text-[0.8125rem] font-medium text-muted">
        {t.registration.stepCounter
          .replace("{current}", String(activeIndex + 1))
          .replace("{total}", String(GROUPS.length))}
        <span className="mx-1.5 text-line-strong">·</span>
        <span className="text-ink">{GROUPS[activeIndex]?.label}</span>
      </p>

      <ol className="flex items-center gap-1.5">
        {GROUPS.map((group, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;

          return (
            <li key={group.key} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  done && "bg-civic-500",
                  active && "bg-civic-600",
                  !done && !active && "bg-line-strong",
                )}
              />
              {/* Screen readers get the state in words, not just colour. */}
              <span className="sr-only">
                {group.label}:{" "}
                {done
                  ? t.registration.stepDone
                  : active
                    ? t.registration.stepCurrent
                    : t.registration.stepUpcoming}
              </span>
              {done ? (
                <Check className="size-3 shrink-0 text-civic-500" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
