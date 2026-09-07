import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import { takeRegistrationCookie, takeSessionCookie } from "./cookie";
import type { ReportDto, VisionResult } from "@/report/types";

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
    /*
     * Practically unreachable: app.config.js falls back to this machine's
     * detected LAN address, so there is always a value. It stays as a real
     * error rather than a silent default because a WRONG address is the one
     * failure that looks like a broken backend instead of a broken setting —
     * every screen loads and every request dies.
     */
    throw new Error(
      "apiBaseUrl is not set. Copy mobile/.env.example to mobile/.env and set " +
        "EXPO_PUBLIC_API_BASE_URL to your computer's LAN address, e.g. " +
        "http://192.168.1.42:3000",
    );
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

/* ---------------------------------------------------------------------------
 * Registration
 *
 * Signing up is a multi-step SERVER-side flow: every step is validated and
 * written to a `registration_session` row, and the client holds nothing but an
 * opaque id in the `civicai.registration` cookie. The mobile app reproduces
 * that exactly rather than inventing a second signup path, so there is one
 * definition of what a valid citizen account is and it lives on the server.
 *
 * Two things differ from `api()` above, and only two:
 *
 *   1. The registration cookie is carried alongside the session cookie.
 *   2. The `{ success: false }` envelope is RETURNED rather than thrown, so a
 *      screen can read `fieldErrors` and put each message under the field it
 *      belongs to — which is what the web forms do.
 * ------------------------------------------------------------------------- */

/*
 * In memory only, and deliberately not in SecureStore.
 *
 * This is a half-finished signup, not a credential. Persisting it across app
 * restarts would resume a stranger's part-completed registration on a shared
 * phone; the web has the same property, where a hard refresh drops it.
 */
let registrationCookie: string | null = null;

/** Forgets the in-progress registration. Called once the account exists. */
export function clearRegistration(): void {
  registrationCookie = null;
}

/** True once a signup is under way — used to decide "resume" vs "start over". */
export function hasRegistration(): boolean {
  return registrationCookie !== null;
}

/*
 * How long a registration request may take before it is abandoned.
 *
 * React Native's fetch has NO default timeout. A large photograph going up a
 * weak connection can therefore leave a promise that never settles and never
 * rejects — which showed on screen as "Reading your CNIC…" for ever, with no
 * error and no way back. Reading a card legitimately takes ten to twenty
 * seconds, so the ceiling is generous; what matters is that one exists.
 */
const UPLOAD_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 30_000;

/** fetch, but it always settles. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The server's envelope, passed through untouched. */
export interface RegistrationResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  reason?: string;
  fieldErrors?: Record<string, string[]>;
  [key: string]: unknown;
}

function captureRegistrationCookie(response: Response): void {
  const header = response.headers.get("set-cookie");
  if (!header) return;
  registrationCookie = takeRegistrationCookie(header) ?? registrationCookie;
}

function registrationHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Origin: baseUrl(),
    ...(registrationCookie ? { Cookie: registrationCookie } : {}),
    ...extra,
  };
}

/** POSTs one registration step and hands back the server's own envelope. */
export async function registrationStep<T = unknown>(
  path: string,
  body: unknown,
): Promise<RegistrationResponse<T>> {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${baseUrl()}${path}`,
      {
        method: "POST",
        headers: registrationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      },
      STEP_TIMEOUT_MS,
    );
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "AbortError";
    return {
      success: false,
      reason: timedOut ? "timeout" : "network",
      message: timedOut
        ? "The server took too long to reply. Please check your connection and try again."
        : `Could not reach CivicAI at ${baseUrl()}. Check that you are on the same network.`,
    };
  }

  captureRegistrationCookie(response);

  const payload = (await response.json().catch(() => null)) as RegistrationResponse<T> | null;

  if (!payload) {
    return { success: false, reason: "unreadable", message: "The server sent an unreadable reply." };
  }

  /*
   * 440 means the registration session expired. Dropping the cookie here stops
   * every later step from failing against a row that is no longer there.
   */
  if (response.status === 440) registrationCookie = null;

  return payload;
}

/** A local image being uploaded — React Native's file shape for FormData. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * POSTs CNIC photographs as `multipart/form-data`.
 *
 * `api()` cannot do this: it sets `Content-Type: application/json` and
 * JSON.stringifies every body. Here the header is left UNSET on purpose —
 * React Native fills in `multipart/form-data` together with the boundary it
 * generated, and hard-coding it would produce a boundary-less header the
 * server cannot parse.
 */
export async function uploadCnic<T = unknown>(
  path: string,
  files: { front: UploadFile; back?: UploadFile | null },
  fields: Record<string, string> = {},
): Promise<RegistrationResponse<T>> {
  const form = new FormData();

  // Field names match the web exactly — see /api/cnic/extract.
  form.append("front", files.front as unknown as Blob);
  if (files.back) form.append("back", files.back as unknown as Blob);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${baseUrl()}${path}`,
      { method: "POST", headers: registrationHeaders(), body: form },
      UPLOAD_TIMEOUT_MS,
    );
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "AbortError";
    return {
      success: false,
      reason: timedOut ? "timeout" : "network",
      message: timedOut
        ? "Sending the photograph took too long. A smaller photo, or a better connection, usually fixes it."
        : `Could not reach CivicAI at ${baseUrl()}. Check that your phone is on the same network as the server.`,
    };
  }

  captureRegistrationCookie(response);

  const payload = (await response.json().catch(() => null)) as RegistrationResponse<T> | null;

  if (!payload) {
    return { success: false, reason: "unreadable", message: "The server sent an unreadable reply." };
  }

  if (response.status === 440) registrationCookie = null;

  return payload;
}

/* ---------------------------------------------------------------------------
 * Reports
 *
 * The citizen report-creation flow: a draft row on the server, walked through
 * photo -> description -> location -> review, exactly mirroring the web's
 * /report/[id]/* wizard against the SAME /api/reports/* endpoints. Report
 * state lives in the database row, not client-side context — every step
 * fetches and patches that one row, so there's nothing to keep in sync
 * locally and a report survives the app being closed mid-flow.
 * ------------------------------------------------------------------------- */

/** Thrown so a screen can read `reason`/`missing` the way the web's fetch call does. */
export class ReportApiError extends ApiError {
  constructor(
    message: string,
    status: number,
    reason?: string,
    readonly missing?: string[],
  ) {
    super(message, status, reason);
  }
}

async function reportRequest<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown; form?: FormData },
): Promise<T> {
  const cookie = await getSessionCookie();

  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: {
      Origin: baseUrl(),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.form ? {} : { "Content-Type": "application/json" }),
    },
    body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) await setSessionCookie(takeSessionCookie(setCookie) ?? cookie);

  if (response.status === 401) {
    await setSessionCookie(null);
    throw new ApiError("Please sign in again.", 401, "unauthenticated");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new ReportApiError(
      payload?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.reason,
      payload?.missing,
    );
  }

  return payload as T;
}

export function createReport() {
  return reportRequest<{ data: ReportDto }>("/api/reports", { method: "POST" }).then((r) => r.data);
}

export function patchReport(id: string, values: Partial<ReportDto>) {
  return reportRequest<{ data: ReportDto }>(`/api/reports/${id}`, {
    method: "PATCH",
    body: values,
  }).then((r) => r.data);
}

export async function uploadReportImage(id: string, file: UploadFile) {
  const form = new FormData();
  form.append("image", file as unknown as Blob);
  const result = await reportRequest<{ data: ReportDto }>(`/api/reports/${id}/image`, {
    method: "POST",
    form,
  });
  return result.data;
}

export async function analyzeReportImage(id: string) {
  const result = await reportRequest<{ data: { report: ReportDto; vision: VisionResult } }>(
    `/api/reports/${id}/analyze-image`,
    { method: "POST" },
  );
  return result.data;
}

export async function submitVoiceDescription(id: string, file: UploadFile) {
  const form = new FormData();
  form.append("audio", file as unknown as Blob);
  const result = await reportRequest<{ data: ReportDto }>(`/api/reports/${id}/transcript`, {
    method: "POST",
    form,
  });
  return result.data;
}

export function submitTextDescription(id: string, text: string) {
  return reportRequest<{ data: ReportDto }>(`/api/reports/${id}/transcript`, {
    method: "POST",
    body: { text },
  }).then((r) => r.data);
}

export interface LocationPayload {
  mode: "gps";
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
}
export interface ManualLocationPayload {
  mode: "manual";
  label: string;
}

export async function submitLocation(id: string, payload: LocationPayload | ManualLocationPayload) {
  const result = await reportRequest<{ data: ReportDto; geocoded?: boolean }>(
    `/api/reports/${id}/location`,
    { method: "POST", body: payload },
  );
  return result;
}

export function generateComplaint(id: string) {
  return reportRequest<{ data: ReportDto }>(`/api/reports/${id}/generate`, {
    method: "POST",
  }).then((r) => r.data);
}

export async function confirmReport(id: string) {
  const result = await reportRequest<{ data: ReportDto; issueCode: string | null }>(
    `/api/reports/${id}/confirm`,
    { method: "POST" },
  );
  return result;
}
