/*
 * Session cookie parsing, kept pure and dependency-free.
 *
 * Split out of the client so it can be unit tested by the main repo's test
 * suite without pulling in Expo. It is worth testing directly: get this wrong
 * and the app either signs everybody out on their second request, or sends a
 * malformed Cookie header that the server quietly ignores — both of which look
 * like an auth bug anywhere but here.
 */

/**
 * Pulls the Better Auth session cookie out of a `set-cookie` header.
 *
 * Only the `name=value` pair is kept. Attributes such as Path, HttpOnly and
 * SameSite are instructions to a browser; echoing them back inside a `Cookie`
 * request header would make the header invalid.
 *
 * Several cookies can arrive in one header, so the session one is chosen by
 * name rather than by position — the order is not guaranteed, and picking the
 * first would break the moment the server sets anything alongside it.
 */
export function takeSessionCookie(header: string): string | null {
  if (!header) return null;

  /*
   * Split on commas that begin a new cookie — a comma followed by `name=`.
   * A plain split on "," would tear apart Expires dates like
   * "Expires=Wed, 09 Jun 2027 10:18:14 GMT".
   */
  const pairs = header
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((chunk) => chunk.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair) && pair.includes("="));

  return pairs.find((pair) => pair.slice(0, pair.indexOf("=")).includes("session_token")) ?? null;
}
