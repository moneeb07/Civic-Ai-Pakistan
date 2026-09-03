import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import { takeSessionCookie } from "./cookie";

/*
 * The one place the app talks to the server.
 *
 * Session handling is the part that does not come for free on a phone. The web
 * app rides on Better Auth's httpOnly cookie, which the browser attaches
 * automatically; React Native's fetch has no cookie jar that survives a cold
 * start, so the cookie is captured from `set-cookie` on sign-in, kept in the
 * OS keychain (SecureStore, not AsyncStorage — this credential is as good as a
 * password) and replayed on every request.
 *
 * Nothing else about auth changes: the server still owns the session, still
 * expires it, and still decides what each request may see. The phone is only
 * carrying the same token the browser would have carried.
 */

const SESSION_KEY = "civicai.session-cookie";

function baseUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof configured !== "string" || configured.length === 0) {
    throw new Error("apiBaseUrl is not configured in app.json → expo.extra.");
  }
  return configured.replace(/\/$/, "");
}

let cached: string | null = null;

export async function getSessionCookie(): Promise<string | null> {
  if (cached !== null) return cached;
  cached = await SecureStore.getItemAsync(SESSION_KEY);
  return cached;
}

async function setSessionCookie(value: string | null): Promise<void> {
  cached = value;
  if (value === null) await SecureStore.deleteItemAsync(SESSION_KEY);
  else await SecureStore.setItemAsync(SESSION_KEY, value);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Calls the CivicAI API and unwraps the `{ success, data }` envelope every
 * route on the server uses.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const cookie = await getSessionCookie();

  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      /*
       * Better Auth rejects a state-changing request whose Origin does not
       * match, as CSRF protection. A native app has no Origin of its own, so it
       * presents the API's own origin — the request genuinely is first-party.
       */
      Origin: baseUrl(),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  // A rotated session cookie has to be captured or the next request signs out.
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) await setSessionCookie(takeSessionCookie(setCookie) ?? cookie);

  if (response.status === 401) {
    await setSessionCookie(null);
    throw new ApiError("Please sign in again.", 401, "unauthenticated");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      payload?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.reason,
    );
  }

  return payload.data as T;
}

/** Signs in against Better Auth and captures the session for future requests. */
export { takeSessionCookie };

export async function signIn(email: string, password: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl() },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message ?? "Those details did not match.", response.status);
  }

  const cookie = takeSessionCookie(response.headers.get("set-cookie") ?? "");
  if (!cookie) throw new ApiError("Sign-in did not return a session.", 500);

  await setSessionCookie(cookie);
}

export async function signOut(): Promise<void> {
  const cookie = await getSessionCookie();
  if (cookie) {
    // Best effort: the local session is cleared either way, so a failed network
    // call can never leave somebody stuck signed in on a shared phone.
    await fetch(`${baseUrl()}/api/auth/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl(), Cookie: cookie },
    }).catch(() => undefined);
  }
  await setSessionCookie(null);
}
