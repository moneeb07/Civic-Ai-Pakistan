import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, lt } from "drizzle-orm";

import { db, schema } from "@/db";
import type { RegistrationData, RegistrationStep } from "./schema";

/*
 * Server-side onboarding state.
 *
 * The browser holds nothing but an opaque id in an httpOnly cookie; all the
 * collected data lives in `registration_session` and is deleted the moment the
 * account is created. That keeps partially-registered citizens out of
 * `user_profile` and keeps identity data out of localStorage.
 */

export const REGISTRATION_COOKIE = "civicai.registration";
const TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

export interface RegistrationSession {
  id: string;
  step: RegistrationStep;
  data: RegistrationData;
}

function newId() {
  return randomBytes(24).toString("base64url");
}

function parseData(raw: string): RegistrationData {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Reads the current onboarding session, or null when there is none. */
export async function getRegistrationSession(): Promise<RegistrationSession | null> {
  const store = await cookies();
  const id = store.get(REGISTRATION_COOKIE)?.value;
  if (!id) return null;

  const [row] = await db
    .select()
    .from(schema.registrationSession)
    .where(eq(schema.registrationSession.id, id))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await deleteRegistrationSession();
    return null;
  }

  return {
    id: row.id,
    step: row.step as RegistrationStep,
    data: parseData(row.data),
  };
}

/** Reads the current session, creating one if the citizen has just started. */
export async function getOrCreateRegistrationSession(): Promise<RegistrationSession> {
  const existing = await getRegistrationSession();
  if (existing) return existing;

  const id = newId();
  const now = new Date();

  await db.insert(schema.registrationSession).values({
    id,
    step: "identity",
    data: "{}",
    expiresAt: new Date(now.getTime() + TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  const store = await cookies();
  store.set(REGISTRATION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });

  // Opportunistic cleanup of sessions abandoned by other citizens.
  await pruneExpiredSessions();

  return { id, step: "identity", data: {} };
}

/** Merges a step's data into the session and records how far the citizen has got. */
export async function updateRegistrationSession(
  id: string,
  patch: Partial<RegistrationData>,
  step?: RegistrationStep,
): Promise<RegistrationSession> {
  const [row] = await db
    .select()
    .from(schema.registrationSession)
    .where(eq(schema.registrationSession.id, id))
    .limit(1);

  if (!row) throw new Error("Registration session not found.");

  const merged: RegistrationData = { ...parseData(row.data), ...patch };

  await db
    .update(schema.registrationSession)
    .set({
      data: JSON.stringify(merged),
      step: step ?? (row.step as RegistrationStep),
      updatedAt: new Date(),
    })
    .where(eq(schema.registrationSession.id, id));

  return {
    id,
    step: (step ?? row.step) as RegistrationStep,
    data: merged,
  };
}

export async function deleteRegistrationSession(): Promise<void> {
  const store = await cookies();
  const id = store.get(REGISTRATION_COOKIE)?.value;

  if (id) {
    await db
      .delete(schema.registrationSession)
      .where(eq(schema.registrationSession.id, id));
  }

  store.delete(REGISTRATION_COOKIE);
}

async function pruneExpiredSessions(): Promise<void> {
  try {
    await db
      .delete(schema.registrationSession)
      .where(lt(schema.registrationSession.expiresAt, new Date()));
  } catch {
    // Cleanup is best-effort; never fail a citizen's sign-up over it.
  }
}

/*
 * Guard used by every step page: sends the citizen back to the first
 * incomplete step rather than letting them deep-link past required data.
 */
export function firstIncompleteStep(data: RegistrationData): RegistrationStep {
  if (!data.cnicEncrypted || !data.fullName) return "identity";
  if (!data.phone || !data.email) return "contact";
  if (!data.city || !data.residentialAddress) return "address";
  return "confirm";
}

export { and, eq };
