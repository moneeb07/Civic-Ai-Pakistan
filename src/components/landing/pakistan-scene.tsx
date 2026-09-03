/*
 * The Pakistani visual language behind the landing hero.
 *
 * Two pieces, both drawn rather than photographed so they stay crisp, weigh
 * nothing, and inherit the theme.
 *
 * The brief is explicit that national identity must not read as decoration —
 * no flag sticker in a corner. So the flag is treated as LIGHT and GROUND: an
 * oversized crescent and star sit far behind the type at low opacity, and the
 * green comes through as the surface itself rather than as a rectangle pasted
 * on top. The architecture is a silhouette on the baseline, Mughal arcade
 * meeting a modern civic skyline — the two eras this product sits between —
 * kept to a whisper so it never competes with the words in front of it.
 */

/** Crescent and star, drawn once and very large. Purely atmospheric. */
export function CrescentField({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M104 16a84 84 0 1 0 55 148 69 69 0 1 1 0-128 83.6 83.6 0 0 0-55-20Z"
        fill="currentColor"
      />
      <path
        d="m150 60 7.9 17.7 19.2 2.1-14.4 12.9 4 18.9-16.7-9.7-16.7 9.7 4-18.9-14.4-12.9 19.2-2.1L150 60Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * The skyline: a Mughal arcade of domes and finials sharing one plinth with a
 * modern civic block.
 *
 * The plinth matters — it is what guarantees the band spans edge to edge at
 * any viewport width. An earlier version drew the buildings as one long path
 * that stopped short of the viewBox, which left a visible vertical seam on
 * wide screens.
 */
export function CivicSkyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Continuous base, so the band never breaks at any width. */}
      <rect y="92" width="1200" height="28" fill="currentColor" opacity="0.14" />

      {/* Modern civic blocks. */}
      <g fill="currentColor" opacity="0.16">
        <rect x="0" y="76" width="78" height="44" />
        <rect x="92" y="60" width="48" height="60" rx="4" />
        <rect x="214" y="68" width="56" height="52" rx="3" />
        <rect x="418" y="72" width="46" height="48" />
        <rect x="478" y="54" width="38" height="66" rx="3" />
        <rect x="648" y="64" width="54" height="56" rx="3" />
        <rect x="860" y="70" width="48" height="50" />
        <rect x="920" y="50" width="36" height="70" rx="3" />
        <rect x="1046" y="66" width="60" height="54" rx="3" />
        <rect x="1160" y="76" width="40" height="44" />
      </g>

      {/* The arcade: domes with finials, a touch brighter than the blocks. */}
      <g fill="currentColor" opacity="0.24">
        <path d="M150 120V84a27 27 0 0 1 54 0v36Z" />
        <rect x="174" y="48" width="4" height="16" rx="2" />
        <path d="M280 120V74a39 39 0 0 1 78 0v46Z" />
        <rect x="316" y="26" width="5" height="20" rx="2.5" />
        <path d="M524 120V82a31 31 0 0 1 62 0v38Z" />
        <rect x="552" y="44" width="4" height="16" rx="2" />
        <path d="M712 120V72a41 41 0 0 1 82 0v48Z" />
        <rect x="751" y="24" width="5" height="20" rx="2.5" />
        <path d="M966 120V80a33 33 0 0 1 66 0v40Z" />
        <rect x="997" y="42" width="4" height="16" rx="2" />
      </g>
    </svg>
  );
}
