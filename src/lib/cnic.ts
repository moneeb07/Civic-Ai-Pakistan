/*
 * Pakistani CNIC helpers — format only.
 *
 * IMPORTANT: nothing in this file establishes that a CNIC is genuine. It checks
 * that a number is *shaped* like a CNIC. Any user-facing wording must say
 * "format checked", never "verified". Real verification requires an authorised
 * NADRA integration, which CivicAI does not have.
 */

/** 13 digits: 5 (region) - 7 (serial) - 1 (check). */
const CNIC_PATTERN = /^(\d{5})-?(\d{7})-?(\d)$/;

export function normaliseCnic(input: string): string {
  return input.replace(/[^\d]/g, "");
}

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

/**
 * Display mask: `35202-*******-1`.
 *
 * Keeps the region prefix and the final digit — enough for a citizen to
 * recognise their own card — and hides the seven identifying digits.
 */
export function maskCnic(input: string): string {
  const digits = normaliseCnic(input);
  const match = CNIC_PATTERN.exec(digits);

  if (!match) return "*****-*******-*";
  return `${match[1]}-*******-${match[3]}`;
}

/**
 * The final digit is odd for men and even for women by NADRA convention.
 *
 * This is a *convention*, not a guarantee, so it is only ever surfaced as an
 * advisory prompt to re-check a field — it must never block registration or be
 * used to overwrite what the citizen told us.
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

/** Masks an email for the review screen: `mu***@example.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";

  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

/** Masks a phone number for the review screen: `+92 3XX XXX4567`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 4) return "***";
  return `+92 3XX XXX${digits.slice(-4)}`;
}
