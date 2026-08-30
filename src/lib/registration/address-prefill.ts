/*
 * Building the Address step's starting values from what the CNIC's back
 * actually said.
 *
 * The bug this replaces: the extracted address was offered as a "tap to use"
 * suggestion and the form itself started blank, so a citizen whose card had
 * been read perfectly still arrived at an empty form and reasonably concluded
 * nothing had been extracted. The address IS extracted (present and permanent,
 * in Urdu, with a Roman mirror) — it just was not being put anywhere they
 * could see it.
 *
 * Pure and framework-free so the precedence rules can be tested directly.
 */

import type { CnicAddressData } from "@/lib/registration/schema";

export interface AddressFormState {
  houseNumber: string;
  city: string;
  district: string;
  sector: string;
  street: string;
  road: string;
  /** Where the citizen lives now — the address CivicAI routes reports by. */
  residentialAddress: string;
  /** The permanent address, kept as printed. Separate field, never merged. */
  permanentAddress: string;
}

export const EMPTY_ADDRESS: AddressFormState = {
  houseNumber: "",
  city: "",
  district: "",
  sector: "",
  street: "",
  road: "",
  residentialAddress: "",
  permanentAddress: "",
};

export interface AddressPrefill {
  values: AddressFormState;
  /**
   * Which of the two addresses were filled in from the card, so the UI can
   * badge them and ask the citizen to check rather than presenting them as
   * facts they already confirmed.
   */
  fromCnic: { current: boolean; permanent: boolean };
}

/** Trimmed, or "" — a whitespace-only saved value is not a value. */
function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Anything the citizen has already saved wins over the card, always.
 *
 * They may have corrected a bad split on a previous visit to this step, or
 * come back to change it; re-applying the CNIC's version over the top would
 * silently throw that away. The card only fills what is still empty.
 *
 * Present address feeds the current-address fields, permanent address feeds
 * the permanent field, and the two are never merged or swapped — a citizen
 * who has moved has a genuinely different current and permanent address, and
 * putting the wrong one in either box is the failure mode that matters here.
 */
export function buildAddressPrefill(
  saved: Partial<AddressFormState> | undefined,
  present: CnicAddressData | null | undefined,
  permanent: CnicAddressData | null | undefined,
): AddressPrefill {
  const base: AddressFormState = { ...EMPTY_ADDRESS, ...saved };
  const values: AddressFormState = {
    houseNumber: text(base.houseNumber),
    city: text(base.city),
    district: text(base.district),
    sector: text(base.sector),
    street: text(base.street),
    road: text(base.road),
    residentialAddress: text(base.residentialAddress),
    permanentAddress: text(base.permanentAddress),
  };

  const fill = (key: keyof AddressFormState, candidate: string | null | undefined) => {
    if (values[key] === "") values[key] = text(candidate);
  };

  let filledCurrent = false;

  if (present) {
    const before = { ...values };

    fill("houseNumber", present.houseNumber);
    fill("city", present.city);
    fill("district", present.district);
    fill("sector", present.sector);
    fill("street", present.streetOrMohalla);
    /*
     * The raw printed line goes into the free-text box rather than being
     * reconstructed from the parts. A printed Urdu address rarely splits into
     * house/street/district as cleanly as a form does, and the raw line is the
     * one thing guaranteed to be exactly what the card says (spec §13).
     */
    fill("residentialAddress", present.raw);

    filledCurrent = (Object.keys(values) as (keyof AddressFormState)[]).some(
      (key) => key !== "permanentAddress" && values[key] !== before[key],
    );
  }

  const permanentBefore = values.permanentAddress;
  if (permanent) fill("permanentAddress", permanent.raw);

  return {
    values,
    fromCnic: {
      current: filledCurrent,
      permanent: values.permanentAddress !== permanentBefore,
    },
  };
}
