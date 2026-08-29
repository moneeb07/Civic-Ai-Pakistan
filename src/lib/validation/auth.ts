import { z } from "zod";

/*
 * Shared between the browser and the server.
 *
 * The client uses these for instant feedback; the server re-runs the exact same
 * schema before touching the database, so client-side validation is never the
 * only gate.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/*
 * A deliberately reachable password policy. CivicAI is for every citizen, not
 * for security professionals — length does more for real-world safety than a
 * symbol requirement that pushes people towards "Passw0rd!".
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    message: "Password is too long.",
  });

/*
 * `.trim()` must come before `.email()`: mobile keyboards and autofill routinely
 * append a trailing space, and validating first would reject a perfectly good
 * address. Lower-casing keeps one citizen from registering twice under
 * Ayesha@… and ayesha@….
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "Please enter your email address." })
  .email({ message: "Please enter a valid email address." })
  .transform((value) => value.toLowerCase());

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Please enter your password." }),
});

export const signUpSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: "Please enter your full name." })
      .max(80, { message: "Name is too long." })
      .transform((value) => value.trim()),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, { message: "Please confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignInValues = z.input<typeof signInSchema>;
export type SignUpValues = z.input<typeof signUpSchema>;

/** Strength shown to the user. Advisory only — it never blocks submission. */
export type PasswordStrength = "empty" | "weak" | "fair" | "strong";

export function assessPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  if (password.length < PASSWORD_MIN_LENGTH) return "weak";

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;

  if (password.length >= 12 && variety >= 3) return "strong";
  if (variety >= 2) return "fair";
  return "weak";
}
