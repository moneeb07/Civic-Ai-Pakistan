/*
 * Pulling an invite token out of whatever an officer actually pastes.
 *
 * The onboarding screen asks for "your invitation link", but what arrives in
 * that box is unpredictable: the full URL from an email, the URL with a
 * tracking query string bolted on, a mail client's line-wrapped copy with
 * stray whitespace, angle brackets from a plain-text mail, or just the bare
 * token because somebody selected only the last part of the link.
 *
 * Rather than validate a shape, find the credential. An invite token is 32
 * random bytes as hex (see newInviteToken), so it is exactly 64 hex characters
 * — long enough that a run of that length in pasted text is the token and not
 * a coincidence.
 *
 * This only EXTRACTS. Whether the token is real, unexpired and unused is
 * decided server-side by lookupInviteByToken, and again when the account is
 * created. Getting past this function is not permission to do anything.
 */

/** An invite token: 32 bytes as hex. Must match newInviteToken() in ids.ts. */
const TOKEN = /[0-9a-fA-F]{64}/;

/**
 * The invite token inside `input`, or null if there isn't one.
 *
 * Returned lowercase: hex is case-insensitive to a human retyping it, but the
 * stored token is lowercase, and the lookup compares exactly.
 */
export function extractInviteToken(input: string): string | null {
  const match = TOKEN.exec(input);
  if (!match) return null;

  const token = match[0].toLowerCase();

  /*
   * A 64-hex run that is part of a LONGER hex run is not a token — it is a
   * chunk of some other identifier, and silently taking the first 64
   * characters of it would send the officer to a confidently wrong page.
   */
  const before = input[match.index - 1];
  const after = input[match.index + match[0].length];
  if (isHex(before) || isHex(after)) return null;

  return token;
}

function isHex(character: string | undefined): boolean {
  return character !== undefined && /[0-9a-fA-F]/.test(character);
}
