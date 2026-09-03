import { z } from "zod";

/*
 * The env contract, kept free of "server-only" so it is unit-testable
 * directly — the same split the citizen side uses for report-image.ts /
 * report-image-utils.ts, and for the same reason: `server-only` throws
 * outside a Next.js bundle, which would make the rules below untestable if
 * they lived beside the process.env read.
 *
 * env.ts is the server wrapper that feeds process.env into this.
 */

/*
 * Exactly "true" or "false", nothing else.
 *
 * A plain truthiness check would read "false" as enabled, and accepting "yes"
 * or "1" would mean guessing which of several plausible intents was meant.
 * Refusing anything else turns a typo into a startup error rather than a
 * silently wrong delivery mode.
 */
const booleanish = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const govEnvSchema = z.object({
  EMAIL_ROUTING_ENABLED: booleanish,
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().trim().min(1).default("CivicAI <noreply@civicai.local>"),
  /*
   * Absolute base for invite links. Reuses Better Auth's own base URL so the
   * two never disagree.
   *
   * `.url()` alone is not enough: it accepts "localhost:3000" (a valid URL
   * whose scheme is `localhost:`), which would produce an invite link no
   * browser can open. The protocol is checked explicitly.
   */
  BETTER_AUTH_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "Must start with http:// or https://",
    )
    .default("http://localhost:3000"),
});

export type GovEnv = z.infer<typeof govEnvSchema>;

/*
 * The raw shape read from the environment, before validation.
 *
 * An open string index rather than `Record<keyof GovEnv, ...>` so process.env
 * (Node's ProcessEnv, which carries every other variable too) can be passed
 * straight in without a cast.
 */
export type GovEnvSource = Record<string, string | undefined>;

/**
 * Validates an environment.
 *
 * Throws naming only the offending FIELDS, never their values — SMTP_PASS
 * must not reach a log line because a sibling variable was malformed.
 */
export function parseGovEnv(source: GovEnvSource): GovEnv {
  const parsed = govEnvSchema.safeParse({
    EMAIL_ROUTING_ENABLED: source.EMAIL_ROUTING_ENABLED || undefined,
    SMTP_HOST: source.SMTP_HOST || undefined,
    SMTP_PORT: source.SMTP_PORT || undefined,
    SMTP_USER: source.SMTP_USER || undefined,
    SMTP_PASS: source.SMTP_PASS || undefined,
    SMTP_FROM: source.SMTP_FROM || undefined,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL || undefined,
  });

  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    throw new Error(`Invalid government portal environment. Check: ${fields}`);
  }

  return parsed.data;
}
