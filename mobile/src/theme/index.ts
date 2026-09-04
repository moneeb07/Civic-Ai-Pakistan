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
