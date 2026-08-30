import { z } from "zod";

import { isValidCnicFormat } from "@/lib/cnic";

/*
 * The registration contract, shared by the browser and the server.
 *
 * Every step validates client-side for immediate feedback and is validated
 * again server-side before it is written anywhere.
 *
 * Note what is absent: the password. It is never stored in the registration
 * session, only passed straight to Better Auth at the final step.
 */

export const REGISTRATION_STEPS = [
  "identity",
  "review",
  "contact",
  "security",
  "address",
  "photo",
  "confirm",
] as const;

export type RegistrationStep = (typeof REGISTRATION_STEPS)[number];

/** Ordered progress groups shown in the stepper. */
export const STEP_ORDER: Record<RegistrationStep, number> = {
  identity: 0,
  review: 1,
  contact: 2,
  security: 3,
  address: 4,
  photo: 5,
  confirm: 6,
};

// -- Identity ---------------------------------------------------------------

export const identitySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { message: "Please enter the name shown on your CNIC." })
    .max(80, { message: "Name is too long." }),
  fatherName: z.string().trim().max(80).optional().or(z.literal("")),
  cnicNumber: z
    .string()
    .trim()
    .refine(isValidCnicFormat, { message: "Please check the CNIC number." }),
  dateOfBirth: z.string().trim().max(20).optional().or(z.literal("")),
  dateOfIssue: z.string().trim().max(20).optional().or(z.literal("")),
  dateOfExpiry: z.string().trim().max(20).optional().or(z.literal("")),
  gender: z.enum(["Male", "Female"]).optional(),
  nationality: z.string().trim().max(40).optional().or(z.literal("")),
});

export type IdentityValues = z.input<typeof identitySchema>;

// -- Contact ----------------------------------------------------------------

/*
 * Pakistani mobile numbers: 03XXXXXXXXX locally, +923XXXXXXXXX internationally.
 * Accepts either and both spacing conventions; stored canonically as +923XXXXXXXXX.
 */
const PHONE_PATTERN = /^(?:\+92|0092|92|0)?3\d{9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => PHONE_PATTERN.test(value), {
    message: "Enter a Pakistani mobile number, for example +92 300 1234567.",
  })
  .transform((value) => `+92${value.replace(/^(?:\+92|0092|92|0)/, "")}`);

export const contactSchema = z.object({
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .min(1, { message: "Please enter your email address." })
    .email({ message: "Please enter a valid email address." })
    .transform((value) => value.toLowerCase()),
});

export type ContactValues = z.input<typeof contactSchema>;

// -- Address ----------------------------------------------------------------

/*
 * The Pakistani CNIC's back side does carry a Present Address and a Permanent
 * Address, so — unlike the fields below it in this file — these CAN be
 * pre-filled from the card. Nothing here is ever populated from thin air,
 * though: only fields Gemini actually read off the back are pre-filled, and
 * the citizen can always overwrite them.
 *
 * "district" sits alongside "sector" because sectors (G-11, F-8) are an
 * Islamabad convention — most Pakistani cities address by tehsil/district
 * instead, so a form that only offered "sector" would leave most citizens
 * with nowhere to put real information.
 */
export const addressSchema = z.object({
  houseNumber: z.string().trim().max(40).optional().or(z.literal("")),
  city: z
    .string()
    .trim()
    .min(1, { message: "Please enter your city." })
    .max(60),
  district: z.string().trim().max(60).optional().or(z.literal("")),
  sector: z.string().trim().max(40).optional().or(z.literal("")),
  street: z.string().trim().max(60).optional().or(z.literal("")),
  road: z.string().trim().max(60).optional().or(z.literal("")),
  residentialAddress: z
    .string()
    .trim()
    .min(1, { message: "Please enter your current address." })
    .max(200),
  /*
   * The permanent address, held separately from the current one and never
   * merged into it (spec §12). Optional because a card may not carry one and
   * a citizen may not have a different permanent address — but when the back
   * WAS read, this arrives pre-filled with exactly what was printed.
   *
   * Longer than the current-address cap: this holds a whole printed line as
   * it appears on the card, rather than the decomposed fields above.
   */
  permanentAddress: z.string().trim().max(300).optional().or(z.literal("")),
});

export type AddressValues = z.input<typeof addressSchema>;

/** The Roman-Urdu mirror of an address block — phonetic, never translated. */
export interface CnicAddressRoman {
  raw: string | null;
  houseNumber: string | null;
  streetOrMohalla: string | null;
  sector: string | null;
  district: string | null;
  city: string | null;
}

/**
 * One address block as read off the CNIC's back — present or permanent.
 *
 * The top-level fields hold the address in the script it was printed in: a
 * card printed in Urdu comes back in Urdu, unchanged. `roman` carries the same
 * address transliterated, for the Latin-script contexts around it. The two are
 * split the same way field for field, so they line up.
 */
export interface CnicAddressData {
  raw: string | null;
  houseNumber: string | null;
  streetOrMohalla: string | null;
  sector: string | null;
  district: string | null;
  city: string | null;
  roman?: CnicAddressRoman | null;
  /** 0–1. Blocks below the confidence bar never reach here — see lib/cnic-confidence.ts. */
  confidence?: number;
}

// -- Profile photo ----------------------------------------------------------

/** A compressed JPEG/PNG/WebP data URL produced by the browser. */
export const profilePhotoSchema = z.object({
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, {
      message: "That image could not be read. Please try another photo.",
    })
    // ~1.4MB of base64 ≈ 1MB of image. The client compresses well below this.
    .max(1_400_000, { message: "That image is too large. Please retake it." }),
});

// -- Preferences ------------------------------------------------------------

export const preferencesSchema = z.object({
  preferredLanguage: z.string().trim().max(8).optional(),
  assistedMode: z.boolean().optional(),
});

// -- Stored session shape ---------------------------------------------------

/**
 * What lives in `registration_session.data`.
 * `cnicEncrypted` replaces the raw number as soon as the identity step is saved.
 */
export interface RegistrationData {
  fullName?: string;
  fatherName?: string | null;
  cnicEncrypted?: string;
  cnicMasked?: string;
  dateOfBirth?: string | null;
  dateOfIssue?: string | null;
  dateOfExpiry?: string | null;
  gender?: string | null;
  nationality?: string | null;
  identitySource?: "cnic_scan" | "manual";
  /** Which identity fields Gemini supplied, so the UI can badge them. */
  extractedFields?: string[];
  /**
   * Present/permanent address as read off the back of the CNIC, kept
   * separately from the confirmed address below so the Address step can offer
   * "use this" without silently overwriting anything the citizen has typed.
   */
  cnicPresentAddress?: CnicAddressData | null;
  cnicPermanentAddress?: CnicAddressData | null;

  phone?: string;
  email?: string;

  // The address the citizen has actually confirmed — pre-filled from one of
  // the two blocks above when they choose to use it, always editable.
  houseNumber?: string | null;
  city?: string;
  district?: string | null;
  sector?: string | null;
  street?: string | null;
  road?: string | null;
  residentialAddress?: string;
  /**
   * The permanent address the citizen confirmed. Distinct from
   * `cnicPermanentAddress` above: that is what the card said, this is what
   * they agreed to after seeing it, and it is what gets saved to the profile.
   */
  permanentAddress?: string | null;

  profileImage?: string;

  preferredLanguage?: string;
  assistedMode?: boolean;
}

// -- Final account creation -------------------------------------------------

export const completeRegistrationSchema = z.object({
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});
