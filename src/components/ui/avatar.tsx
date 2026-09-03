import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Initials avatar.
 *
 * No photographs and no generated faces: this is a government product, the
 * people in it are staff and citizens, and a coloured monogram identifies a
 * colleague in a participant list perfectly well without inventing a likeness.
 */

/** Two initials from a name — first and last word, so "Muhammad Ali Khan" is MK. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/*
 * A stable tint per person, picked from the name.
 *
 * Deterministic so the same colleague is the same colour on every screen —
 * a randomly-assigned tint would make the participant list flicker between
 * renders and destroy the recognition the avatar exists for.
 */
const TINTS = [
  "bg-civic-100 text-civic-700",
  "bg-civic-200 text-civic-900",
  "bg-status-process-bg text-status-process",
  "bg-status-resolved-bg text-status-resolved",
  "bg-canvas text-ink",
] as const;

function tintFor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return TINTS[hash % TINTS.length]!;
}

const SIZES = {
  sm: "size-6 text-[0.625rem]",
  md: "size-9 text-[0.8125rem]",
  lg: "size-12 text-[1rem]",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-bold",
        SIZES[size],
        tintFor(name),
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Overlapping stack for participant lists. Collapses past `max`. */
export function AvatarGroup({
  names,
  max = 4,
  size = "sm",
}: {
  names: string[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <span className="flex items-center">
      {shown.map((name) => (
        <Avatar
          key={name}
          name={name}
          size={size}
          className="-mr-1.5 ring-2 ring-surface last:mr-0"
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "inline-grid place-items-center rounded-full bg-canvas font-bold text-muted ring-2 ring-surface",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
