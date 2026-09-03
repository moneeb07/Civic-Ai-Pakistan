import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { takeSessionCookie } from "../mobile/src/api/cookie";

/*
 * The mobile app has no browser cookie jar, so it captures the Better Auth
 * session cookie by hand and replays it on every request. That makes this small
 * parser load-bearing for all mobile authentication: get it wrong and the app
 * either signs everyone out on their second request or sends a header the
 * server ignores — both of which present as an auth bug, not a parsing one.
 */
describe("takeSessionCookie", () => {
  it("takes the name=value pair and drops browser-only attributes", () => {
    const header =
      "better-auth.session_token=abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";

    assert.equal(takeSessionCookie(header), "better-auth.session_token=abc123");
  });

  it("picks the session cookie by name, not by position", () => {
    // Order is not guaranteed, so taking the first cookie would be a bug.
    const header =
      "better-auth.csrf=xyz; Path=/, better-auth.session_token=abc123; Path=/; HttpOnly";

    assert.equal(takeSessionCookie(header), "better-auth.session_token=abc123");
  });

  it("is not fooled by the comma inside an Expires date", () => {
    /*
     * "Expires=Wed, 09 Jun 2027 …" contains a comma. A naive split on "," tears
     * the cookie in half and yields a value the server will not accept.
     */
    const header =
      "better-auth.session_token=abc123; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/";

    assert.equal(takeSessionCookie(header), "better-auth.session_token=abc123");
  });

  it("returns null when no session cookie is present", () => {
    assert.equal(takeSessionCookie("other=1; Path=/"), null);
    assert.equal(takeSessionCookie(""), null);
  });

  it("keeps a value containing '=' intact", () => {
    // Signed cookie values are base64 and routinely end in padding.
    const header = "better-auth.session_token=YWJjMTIz==.sig; Path=/; HttpOnly";

    assert.equal(takeSessionCookie(header), "better-auth.session_token=YWJjMTIz==.sig");
  });
});
