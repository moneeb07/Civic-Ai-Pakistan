import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/db";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/validation/auth";

if (!process.env.BETTER_AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production. Generate one with: openssl rand -base64 32",
  );
}

export const auth = betterAuth({
  appName: "CivicAI",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  /*
   * Origins allowed to make state-changing requests (Better Auth's CSRF check).
   *
   * The mobile app has no Origin of its own, so it presents the API's own
   * origin — see mobile/src/api/client.ts. On a physical phone that is the
   * machine's LAN address, not localhost, so a dev server reachable at both
   * has to trust both or sign-in fails CSRF from the phone only.
   *
   * Driven by an env var so no address is hard-coded: set
   * ADDITIONAL_TRUSTED_ORIGINS to a comma-separated list.
   */
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    ...(process.env.ADDITIONAL_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],

  emailAndPassword: {
    enabled: true,
    // Password hashing is handled by Better Auth (scrypt) — CivicAI never
    // sees, stores or logs a plaintext password.
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Signing in immediately after registering keeps onboarding to one step.
    autoSignIn: true,
    // Stage 1 has no transactional email provider wired up. Rather than ship a
    // fake "verification email sent" screen, verification stays off until a real
    // provider is configured; the field exists on `user` for that future stage.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh a session at most once a day
  },

  advanced: {
    // Citizens on shared or low-end devices benefit from cookies that other
    // sites cannot read and scripts cannot exfiltrate.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  // Blunt protection against credential-stuffing and signup spam. Better Auth
  // applies stricter per-path limits on top of this window.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },

  // Must stay last: lets Better Auth set cookies from Next.js server actions.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
