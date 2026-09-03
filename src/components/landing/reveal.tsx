"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

/*
 * The motion layer.
 *
 * Two rules govern everything here, and they are the difference between a page
 * that feels expensive and one that feels like a template:
 *
 * 1. Content is VISIBLE AT REST. Nothing is parked at opacity 0 waiting for an
 *    observer to rescue it. The hero animates on mount, and anything further
 *    down the page animates only when it is already in view — so a screenshot,
 *    a shared link preview, a printout, or a browser that never fires the
 *    observer all show a complete page. A section that stays invisible because
 *    an IntersectionObserver did not run is not a subtle animation, it is a
 *    blank page.
 *
 * 2. `prefers-reduced-motion` removes the movement, not the content. Under that
 *    setting every variant collapses to its final state immediately.
 *
 * The movement itself is small — 12px and a fade, staggered — because this is a
 * government service. Motion here is used to establish reading ORDER, not to
 * perform.
 */

const DISTANCE = 12;

/** Parent: staggers its children so a group resolves as a sequence, not a flash. */
export function RevealGroup({
  children,
  className,
  delay = 0,
  stagger = 0.07,
  /** Animate as soon as it mounts, for content already above the fold. */
  immediate = false,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  immediate?: boolean;
} & Pick<React.ComponentProps<"div">, "role" | "aria-label" | "id">) {
  const reduced = useReducedMotion();

  const variants: Variants = {
    hidden: {},
    shown: {
      transition: {
        delayChildren: delay,
        staggerChildren: reduced ? 0 : stagger,
      },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      {...(immediate
        ? { animate: "shown" }
        : // once: the page must not re-animate as somebody scrolls back up.
          { whileInView: "shown", viewport: { once: true, margin: "-80px" } })}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Child of RevealGroup. Rises into place; instant under reduced motion. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  const variants: Variants = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0, y: DISTANCE },
    shown: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <Component
      // `as="li"` renders a real <li> for semantics, which also brings
      // display:list-item and a marker bullet — visible as a stray dot beside
      // every card in a grid. Killed here rather than at each call site.
      className={cn(as === "li" && "list-none", className)}
      variants={variants}
    >
      {children}
    </Component>
  );
}
