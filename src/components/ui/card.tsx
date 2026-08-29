import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * The surface every screen is built from: white, softly bordered, generously
 * padded. Depth comes from the border and a low shadow, not from elevation.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-[1.0625rem] font-semibold tracking-tight text-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase section marker used above grouped content. */
function CardEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardBody, CardTitle, CardEyebrow };
