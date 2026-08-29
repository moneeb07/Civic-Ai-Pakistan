import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/*
 * The authoritative session check.
 *
 * `middleware.ts` does a fast cookie-presence check for routing, but it cannot
 * validate a session — a forged or expired cookie passes it. Every protected
 * page must call one of these, which verify the session against the database.
 */

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Use on protected pages. Redirects to sign-in when there is no valid session. */
export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/auth/sign-in");
  }

  return session;
}

/** Use on auth pages so a signed-in citizen is not shown a login form. */
export async function redirectIfAuthenticated(destination = "/dashboard") {
  const session = await getSession();

  if (session) {
    redirect(destination);
  }
}
