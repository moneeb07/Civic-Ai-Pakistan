/*
 * Validating a `?next=` redirect destination.
 *
 * Kept free of `server-only` so the rule can be unit-tested directly: this
 * decides where somebody lands the instant after they type their password,
 * which is exactly when they are least likely to check the address bar.
 */

/**
 * Returns the path if it is a safe same-site destination, otherwise null.
 *
 * Only absolute internal paths are allowed. Without this the parameter is an
 * open redirect — a link to our own sign-in page could bounce a user to an
 * attacker's lookalike immediately after authenticating.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  // "//evil.example" and "/\evil.example" are protocol-relative: the browser
  // reads them as another site despite the leading slash.
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
