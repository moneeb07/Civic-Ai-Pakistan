/*
 * The registration rules, mirrored from the web.
 *
 * The server validates all of this again — these copies exist only so a
 * citizen finds out about a mistyped CNIC while their thumb is still on the
 * keyboard, rather than after a round trip. Where the two could ever disagree
 * the SERVER is right, and the screens surface its `fieldErrors` verbatim.
 *
 * Kept as plain functions rather than pulling Zod into the app: these are a
 * dozen rules, and the phone should not ship a schema library to check them.
 * The source of truth is src/lib/registration/schema.ts and src/lib/cnic.ts.
 */

/* -- CNIC ---------------------------------------------------------------- */

/** 13 digits: 5 (region) - 7 (serial) - 1 (check). */
const CNIC_PATTERN = /^(\d{5})-?(\d{7})-?(\d)$/;

export function normaliseCnic(input: string): string {
  return input.replace(/[^\d]/g, "");
}

/*
 * IMPORTANT: this establishes that a number is SHAPED like a CNIC, never that
 * it is genuine. Real verification needs an authorised NADRA integration,
 * which CivicAI does not have — so user-facing wording says "format checked",
 * never "verified".
 */
export function isValidCnicFormat(input: string): boolean {
  const digits = normaliseCnic(input);
  return digits.length === 13 && CNIC_PATTERN.test(digits);
}

/** Canonical `#####-#######-#` form. Throws if the input is not CNIC-shaped. */
export function formatCnic(input: string): string {
  const digits = normaliseCnic(input);
  const match = CNIC_PATTERN.exec(digits);
  if (!match) throw new Error("Value is not in CNIC format.");
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Display mask: `35202-*******-1`. */
export function maskCnic(input: string): string {
  const digits = normaliseCnic(input);
  const match = CNIC_PATTERN.exec(digits);
  if (!match) return "*****-*******-*";
  return `${match[1]}-*******-${match[3]}`;
}

/** Formats digits as the citizen types, so the dashes appear by themselves. */
export function liveFormatCnic(input: string): string {
  const digits = normaliseCnic(input).slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * The final digit is odd for men and even for women by NADRA convention.
 *
 * A *convention*, not a guarantee — so it is only ever surfaced as an advisory
 * prompt to re-check a field. It must never block registration or overwrite
 * what the citizen told us.
 */
export function genderMatchesCnicConvention(
  cnic: string,
  gender: string | null | undefined,
): boolean | null {
  if (!gender) return null;

  const digits = normaliseCnic(cnic);
  if (digits.length !== 13) return null;

  const normalised = gender.trim().toLowerCase();
  if (normalised !== "male" && normalised !== "female") return null;

  const isOdd = Number(digits[12]) % 2 === 1;
  return normalised === "male" ? isOdd : !isOdd;
}

/* -- Contact ------------------------------------------------------------- */

/*
 * Pakistani mobile numbers: 03XXXXXXXXX locally, +923XXXXXXXXX internationally.
 * Accepts either and both spacing conventions; stored canonically as +923XXXXXXXXX.
 */
const PHONE_PATTERN = /^(?:\+92|0092|92|0)?3\d{9}$/;

export function isValidPhone(input: string): boolean {
  return PHONE_PATTERN.test(input.trim().replace(/[\s()-]/g, ""));
}

/** Canonical `+923XXXXXXXXX`. Returns null when the number is not valid. */
export function canonicalPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s()-]/g, "");
  if (!PHONE_PATTERN.test(cleaned)) return null;
  return `+92${cleaned.replace(/^(?:\+92|0092|92|0)/, "")}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(input: string): boolean {
  return EMAIL_PATTERN.test(input.trim());
}

/* -- Masking for the review screen --------------------------------------- */

/** `mu***@example.com` */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

/** `+92 3XX XXX4567` */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 4) return "***";
  return `+92 3XX XXX${digits.slice(-4)}`;
}

/* -- Field limits, matching the server ----------------------------------- */

export const LIMITS = {
  fullName: 80,
  fatherName: 80,
  nationality: 40,
  city: 60,
  district: 60,
  sector: 40,
  street: 60,
  road: 60,
  houseNumber: 40,
  residentialAddress: 200,
  permanentAddress: 300,
  passwordMin: 8,
} as const;
