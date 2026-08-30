/*
 * Whether an address already read off a CNIC survives a later save.
 *
 * The registration session is merged, not replaced, so the identity step used
 * to write its address fields unconditionally — meaning any second pass
 * through that step (entering details by hand, or a rescan that only captured
 * the front) silently overwrote a correctly-read address with null. The
 * address was extracted every time; it was destroyed on the way in. That is
 * the "worked the first time, never again" failure.
 *
 * Pure and framework-free so the precedence can be tested without a session,
 * a database or a Gemini call.
 */

import type { CnicAddressData } from "@/lib/registration/schema";

export interface AddressPair {
  present: CnicAddressData | null;
  permanent: CnicAddressData | null;
}

/**
 * A freshly-read address always wins. Otherwise the stored one survives — but
 * only while it belongs to the same card.
 *
 * `sameCard` is the safety condition, not a nicety: carrying an address across
 * a change of CNIC number would attach one person's address to another
 * person's identity, which is far worse than the blank form it replaces.
 * Each side is decided independently, so a scan that reads only the permanent
 * address does not discard a present address read a moment earlier.
 */
export function carryOverAddresses(
  incoming: AddressPair,
  stored: Partial<AddressPair> | undefined,
  sameCard: boolean,
): AddressPair {
  const kept: AddressPair = sameCard
    ? { present: stored?.present ?? null, permanent: stored?.permanent ?? null }
    : { present: null, permanent: null };

  return {
    present: incoming.present ?? kept.present,
    permanent: incoming.permanent ?? kept.permanent,
  };
}
