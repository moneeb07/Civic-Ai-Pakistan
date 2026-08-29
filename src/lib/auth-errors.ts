import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/*
 * Maps a Better Auth error onto CivicAI copy.
 *
 * Sign-in deliberately collapses every credential failure into one message:
 * telling an attacker that an email exists but the password was wrong hands
 * them account enumeration for free.
 */
export function describeSignInError(error: AuthErrorLike | null | undefined) {
  if (!error) return t.errors.unexpected;
  if (error.status === 429) return t.errors.tooManyRequests;
  return t.errors.signInFailed;
}

export function describeSignUpError(error: AuthErrorLike | null | undefined) {
  if (!error) return t.errors.unexpected;
  if (error.status === 429) return t.errors.tooManyRequests;

  const code = error.code?.toUpperCase() ?? "";
  if (code.includes("USER_ALREADY_EXISTS") || code.includes("EMAIL")) {
    if (code.includes("EXIST")) return t.errors.emailTaken;
  }
  if (error.status === 422) return t.errors.emailTaken;

  return t.errors.signUpFailed;
}

/** Thrown fetch failures (offline, DNS, server down) rather than API errors. */
export function describeNetworkError() {
  return t.errors.network;
}
