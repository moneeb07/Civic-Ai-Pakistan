/*
 * Turning "@Ahmed please inspect this" into a mention of a real member.
 *
 * The rule that matters is a security rule, not a formatting one: a mention
 * may only ever resolve to somebody the author is actually allowed to mention
 * — a member of the department that owns the issue. Anything else in the text
 * that looks like an @handle is left as plain text.
 *
 * Two reasons that is enforced here rather than in the UI. A mention that
 * resolved to an arbitrary member would notify someone about work they have no
 * access to; and an endpoint that accepted any name would let a caller probe
 * for who exists in other departments by watching which mentions stick.
 *
 * Pure and framework-free so the rule can be tested directly.
 */

export interface MentionableMember {
  id: string;
  displayName: string;
  memberCode: string;
}

export interface ResolvedMention {
  memberId: string;
  displayName: string;
  /** Exactly the text that was matched, so the UI can highlight it. */
  matched: string;
}

/*
 * Matches "@" followed by up to three capitalised-ish words, so both "@Ahmed"
 * and "@Ahmed Nawaz" work, as does a member code like "@CDA-10482". Stops at
 * punctuation so "@Ahmed, please" does not swallow the comma.
 */
const MENTION_PATTERN = /@([\p{L}][\p{L}\p{N}.'-]*(?:[ \t]+[\p{L}][\p{L}\p{N}.'-]*){0,2})/gu;

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds the mentions in a message body, resolved against the members the
 * author is permitted to mention.
 *
 * Longest match wins: with both "Ahmed" and "Ahmed Nawaz" in the department,
 * "@Ahmed Nawaz" resolves to the full name rather than stopping at the first
 * word. An ambiguous first name that matches two members resolves to neither —
 * silently picking one would put the wrong person's name on the message.
 */
export function resolveMentions(
  body: string,
  members: MentionableMember[],
): ResolvedMention[] {
  if (members.length === 0) return [];

  const byFullName = new Map<string, MentionableMember[]>();
  const byFirstName = new Map<string, MentionableMember[]>();
  const byCode = new Map<string, MentionableMember>();

  for (const member of members) {
    const full = normalise(member.displayName);
    const first = full.split(" ")[0];

    byFullName.set(full, [...(byFullName.get(full) ?? []), member]);
    byFirstName.set(first, [...(byFirstName.get(first) ?? []), member]);
    byCode.set(normalise(member.memberCode), member);
  }

  const found = new Map<string, ResolvedMention>();

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const raw = match[1];
    const words = raw.trim().split(/\s+/);

    // Try the longest candidate first: "Ahmed Nawaz" before "Ahmed".
    for (let length = words.length; length >= 1; length--) {
      const candidate = normalise(words.slice(0, length).join(" "));

      const byCodeHit = byCode.get(candidate);
      if (byCodeHit) {
        found.set(byCodeHit.id, {
          memberId: byCodeHit.id,
          displayName: byCodeHit.displayName,
          matched: words.slice(0, length).join(" "),
        });
        break;
      }

      const exact = byFullName.get(candidate);
      if (exact?.length === 1) {
        found.set(exact[0].id, {
          memberId: exact[0].id,
          displayName: exact[0].displayName,
          matched: words.slice(0, length).join(" "),
        });
        break;
      }

      const first = byFirstName.get(candidate);
      if (first?.length === 1) {
        found.set(first[0].id, {
          memberId: first[0].id,
          displayName: first[0].displayName,
          matched: words.slice(0, length).join(" "),
        });
        break;
      }

      /*
       * An ambiguous single name (two Ahmeds in the department) deliberately
       * falls through rather than guessing. The author sees their mention did
       * not resolve and can use the full name — better than quietly notifying
       * the wrong colleague.
       */
    }
  }

  return [...found.values()];
}

/** Members whose names a search box should offer for an @mention. */
export function searchMentionable(
  query: string,
  members: MentionableMember[],
  limit = 8,
): MentionableMember[] {
  const term = normalise(query);
  if (!term) return members.slice(0, limit);

  return members
    .filter(
      (member) =>
        normalise(member.displayName).includes(term) ||
        normalise(member.memberCode).includes(term),
    )
    .slice(0, limit);
}
