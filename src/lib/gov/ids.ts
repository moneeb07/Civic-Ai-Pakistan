import { randomBytes } from "node:crypto";

/*
 * Identifiers, matching the citizen side's convention exactly
 * (see newId() in src/lib/report/store.ts): 16 random bytes, base64url.
 * Sequential ids would let anyone holding one complaint id guess the next.
 */
export function newId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * An invite token: 32 bytes as hex, per the ticket.
 *
 * Wider than an id because it is a bearer credential — whoever holds it can
 * create a government account with the role the invite grants.
 */
export function newInviteToken(): string {
  return randomBytes(32).toString("hex");
}
