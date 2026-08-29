import { cn } from "@/lib/utils";

/*
 * CivicAI mark: a rounded square holding a crescent-and-star silhouette formed
 * out of negative space, with a rising civic bar beneath it. Drawn rather than
 * imported so it stays crisp at every size and inherits the current colour.
 */
function CivicAIMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={cn("size-10", className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" className="fill-current" />
      {/* Crescent, cut from the mark by overlaying the background circle. */}
      <path
        d="M20.5 9.5a10.5 10.5 0 1 0 6.9 18.4 8.6 8.6 0 1 1 0-15.8 10.4 10.4 0 0 0-6.9-2.6Z"
        className="fill-white"
      />
      {/* Star */}
      <path
        d="m29.4 15.6.98 2.2 2.38.26-1.78 1.6.5 2.35-2.08-1.2-2.08 1.2.5-2.35-1.78-1.6 2.38-.26.98-2.2Z"
        className="fill-white"
      />
      {/* Civic bars — infrastructure rising. */}
      <rect x="12" y="26" width="3" height="5" rx="1.5" className="fill-white/55" />
      <rect x="17.5" y="23.5" width="3" height="7.5" rx="1.5" className="fill-white/75" />
      <rect x="23" y="27.5" width="3" height="3.5" rx="1.5" className="fill-white/45" />
    </svg>
  );
}

interface CivicAILogoProps {
  className?: string;
  /** `light` for use on the deep-green panel, `dark` for light surfaces. */
  tone?: "dark" | "light";
  showCountry?: boolean;
  markClassName?: string;
}

export function CivicAILogo({
  className,
  tone = "dark",
  showCountry = true,
  markClassName,
}: CivicAILogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <CivicAIMark
        className={cn(
          tone === "light" ? "text-civic-500" : "text-civic-600",
          markClassName,
        )}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-lg font-semibold tracking-tight",
            tone === "light" ? "text-white" : "text-ink",
          )}
        >
          CivicAI
        </span>
        {showCountry ? (
          <span
            className={cn(
              "mt-1 text-[0.6875rem] font-medium uppercase tracking-[0.16em]",
              tone === "light" ? "text-white/60" : "text-muted",
            )}
          >
            Pakistan
          </span>
        ) : null}
      </span>
    </span>
  );
}

export { CivicAIMark };
