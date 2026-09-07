/*
 * One palette, shared with the web app's tokens so the two products look like
 * the same product. Kept as plain objects rather than a styling library: the
 * app is small enough that a dependency would cost more than it saves.
 */
export const colors = {
  canvas: "#f7faf8",
  surface: "#FFFFFF",
  ink: "#10231d",
  muted: "#6b7a74",
  line: "#e4ede8",
  lineStrong: "#d3e0d9",
  /*
   * Pakistan green, taken from the web app's own --color-civic-* tokens in
   * src/app/globals.css. The two products are one product, so a citizen who
   * reports on the phone and checks on the laptop should not feel handed off
   * between two different brands.
   */
  // The brighter tint, for signals that must read against a dark scrim —
  // the CNIC camera overlay turning green when the card is aligned.
  civic500: "#0b8f6a",
  civic600: "#006a4e",
  civic700: "#005a42",
  civic900: "#003b2f",
  civic200: "#bfe9d9",
  civic100: "#ddf5ec",
  civic50: "#f1faf6",
  amber100: "#FEF3C7",
  amber700: "#B45309",
  danger: "#b4231f",
  dangerBg: "#fdf2f1",
  white: "#FFFFFF",
} as const;

export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/*
 * Icon + soft tint per figure — the web dashboard's `StatCard tone` system,
 * one definition shared by every screen that shows the citizen's own report
 * counts (the Home dashboard and the My Reports list). It used to be defined
 * separately on the Home screen; a second screen needing the exact same four
 * colours is what actually justifies moving it here rather than copying it
 * again. The point of it is recognition: a citizen who checks a report's
 * status on the phone and then on the laptop should see the same red/amber/
 * green, not re-learn a second palette.
 */
export const STAT_TONES = {
  neutral: { icon: "document-text-outline", bg: colors.civic50, fg: colors.civic700 },
  danger: { icon: "alert-circle-outline", bg: "#fdf1f3", fg: "#a81d33" },
  warning: { icon: "time-outline", bg: "#fdf6ea", fg: "#c2790a" },
  success: { icon: "checkmark-circle-outline", bg: "#eefaf5", fg: "#0b8f6a" },
} as const;

/** Matches the web app: Pakistan Standard Time, so both show the same clock. */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
