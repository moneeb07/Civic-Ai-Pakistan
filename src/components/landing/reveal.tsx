"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * The motion layer.
 *
 * Two rules govern everything here, and they are the difference between a page
 * that feels expensive and one that feels like a template:
 *
 * 1. Content is VISIBLE AT REST. Nothing is parked at opacity 0 waiting for
 *    JavaScript to rescue it. A screenshot, a link preview, a printout, a slow
 *    phone that has not hydrated yet, or a browser that never fires the
 *    observer must all show a complete page. A hero that stays invisible
 *    because a script did not run is not a subtle animation, it is a blank
 *    page.
 *
 * 2. `prefers-reduced-motion` removes the movement, not the content.
 *
 * WHY THIS IS CSS AND NOT FRAMER-MOTION
 *
 * It used to be framer-motion, with `initial="hidden"` and a variant of
 * `{ opacity: 0 }`. That put `style="opacity:0"` into the SERVER-RENDERED
 * HTML — so the markup shipped with the <h1> already invisible, and it only
 * became visible once the bundle downloaded, hydrated and animated. It broke
 * rule 1 in the one place it mattered most, and the landing hero rendered
 * blank in every screenshot.
 *
 * A CSS animation has the property that matters here: it runs off the
 * stylesheet, so it cannot fail to finish. Even with JavaScript disabled
 * entirely, the keyframes play and settle on the visible end state. The
 * in-view variant goes further and applies NO hidden state at all unless the
 * observer has actually marked the group ready — so if the observer never
 * runs, the content simply sits there, visible and unanimated.
 *
 * framer-motion is still the right tool for interactive and gesture-driven
 * motion; it is the wrong tool for an entrance that must survive its own
 * absence.
 *
 * The movement itself is small — 12px and a fade, staggered — because this is
 * a government service. Motion here establishes reading ORDER, not spectacle.
 */

interface RevealGroupProps
  extends Pick<React.ComponentProps<"div">, "role" | "aria-label" | "id"> {
  children: React.ReactNode;
  className?: string;
  /** Animate as soon as it mounts, for content already above the fold. */
  immediate?: boolean;
}

/** Parent: staggers its children so a group resolves as a sequence, not a flash. */
export function RevealGroup({
  children,
  className,
  immediate = false,
  ...rest
}: RevealGroupProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    if (immediate) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          // once: the page must not re-animate as somebody scrolls back up.
          observer.disconnect();
        }
      },
      { rootMargin: "-80px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate]);

  return (
    <div
      ref={ref}
      className={cn(immediate ? "civic-reveal-now" : "civic-reveal-inview", className)}
      data-shown={immediate || shown ? "true" : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Child of RevealGroup. Rises into place; instant under reduced motion.
 *
 * It carries no hidden styling of its own — the stagger and the keyframes are
 * selected by the parent's class, which is what keeps an un-hydrated page
 * readable.
 */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "span";
}) {
  const Component = as;

  return (
    <Component
      // `as="li"` renders a real <li> for semantics, which also brings
      // display:list-item and a marker bullet — visible as a stray dot beside
      // every card in a grid. Killed here rather than at each call site.
      className={cn(as === "li" && "list-none", className)}
    >
      {children}
    </Component>
  );
}
