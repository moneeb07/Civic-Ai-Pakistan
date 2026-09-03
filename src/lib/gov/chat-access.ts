/*
 * Who may read a private thread.
 *
 * Kept as a pure function, free of `server-only`, so the rule can be unit
 * tested directly rather than only through a live request. Everything else
 * about government permissions lives in authorize.ts, which owns the role
 * model; this file owns exactly one decision, because that decision is
 * deliberately NOT a role question.
 *
 * The distinctive property, and the one worth guarding with a test: seniority
 * is not a way in. A platform admin or a department head who is not a
 * participant cannot read a private thread — otherwise "private" would only
 * ever mean "private from your peers", which is not what anyone choosing it
 * would understand it to mean. Someone who needs the context asks to be added,
 * exactly like everybody else, and then sees the whole history.
 */

/** True when this officer is a participant of the thread. */
export function canSeePrivateThread(
  officerId: string,
  participantOfficerIds: string[],
): boolean {
  return participantOfficerIds.includes(officerId);
}

/**
 * Whether an officer may post in a thread they can see.
 *
 * Always true, and that is the point rather than an oversight: inside a
 * department every officer is a peer. A `member` can answer a `dept_head`, and
 * can raise something the head has not noticed, without needing permission —
 * which is the whole reason this platform exists instead of a WhatsApp group.
 * The function exists so the intent is stated once, in code, rather than being
 * an absence somebody later mistakes for a missing check.
 */
export function canPostInThread(): boolean {
  return true;
}
