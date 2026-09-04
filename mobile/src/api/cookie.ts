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
 * Splits a `set-cookie` header into its `name=value` pairs.
 *
 * Attributes such as Path, HttpOnly and SameSite are instructions to a
 * browser; echoing them back inside a `Cookie` request header would make the
 * header invalid, so only the leading pair of each cookie is kept.
 */
function cookiePairs(header: string): string[] {
  if (!header) return [];

  /*
   * Split on commas that begin a new cookie — a comma followed by `name=`.
   * A plain split on "," would tear apart Expires dates like
   * "Expires=Wed, 09 Jun 2027 10:18:14 GMT".
   */
  return header
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((chunk) => chunk.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair) && pair.includes("="));
}

/** The cookie's name, i.e. everything left of the first `=`. */
function nameOf(pair: string): string {
  return pair.slice(0, pair.indexOf("="));
}

/**
 * Pulls the Better Auth session cookie out of a `set-cookie` header.
 *
 * Several cookies can arrive in one header, so the session one is chosen by
 * name rather than by position — the order is not guaranteed, and picking the
 * first would break the moment the server sets anything alongside it.
 */
export function takeSessionCookie(header: string): string | null {
  return cookiePairs(header).find((pair) => nameOf(pair).includes("session_token")) ?? null;
}

/**
 * Pulls the registration cookie (`civicai.registration`) out of a `set-cookie`
 * header.
 *
 * Signing up is a multi-step server-side flow: the phone holds nothing but an
 * opaque id, and every step is read back from the row it points at. Without
 * this the second step would start a brand-new empty session and the citizen
 * would loop on step one for ever — which is exactly why the flow could not
 * simply be pointed at the existing client.
 *
 * Kept separate from the session cookie rather than folded into one "keep
 * every cookie" jar: these two have very different lifetimes and blast radii,
 * and only one of them is as good as a password.
 */
export function takeRegistrationCookie(header: string): string | null {
  return cookiePairs(header).find((pair) => nameOf(pair) === "civicai.registration") ?? null;
}
