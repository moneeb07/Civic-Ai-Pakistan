/*
 * One palette, shared with the web app's tokens so the two products look like
 * the same product. Kept as plain objects rather than a styling library: the
 * app is small enough that a dependency would cost more than it saves.
 */
export const colors = {
  canvas: "#F6F7F9",
  surface: "#FFFFFF",
  ink: "#14181F",
  muted: "#6B7280",
  line: "#E5E7EB",
  lineStrong: "#D1D5DB",
  civic600: "#1F6FEB",
  civic700: "#1A5FCC",
  civic100: "#DCE9FF",
  civic50: "#F0F6FF",
  amber100: "#FEF3C7",
  amber700: "#B45309",
  danger: "#DC2626",
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
