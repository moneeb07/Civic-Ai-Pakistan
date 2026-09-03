import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatInviteBox, formatPktTimestamp } from "../src/services/email/invite-box";

/*
 * The terminal invite block is the ONLY delivery path in development, so it is
 * the whole feature - a clipped or misaligned link means an officer cannot be
 * invited at all. These check the things that would break that.
 */

const EXPIRES = new Date("2026-09-05T09:23:00Z");

describe("formatPktTimestamp", () => {
  it("renders in Pakistan Standard Time, not the machine's timezone", () => {
    // 09:23 UTC is 14:23 PKT (UTC+5). The result must not depend on where the
    // server happens to run, which is why the formatter pins Asia/Karachi.
    assert.equal(formatPktTimestamp(EXPIRES), "2026-09-05 14:23 PKT");
  });
});

describe("formatInviteBox", () => {
  // 64 chars, exactly what crypto.randomBytes(32).toString("hex") produces.
  const longToken = "a1b2c3d4".repeat(8);
  const inviteUrl = `http://localhost:3000/gov/invite/${longToken}`;

  const box = formatInviteBox({
    to: "officer@example.com",
    inviteUrl,
    role: "dept_head",
    orgName: "CDA",
    deptName: "Roads & Infrastructure",
    expiresAt: EXPIRES,
  });

  it("prints the invite URL in full - a truncated link is not an invite", () => {
    assert.ok(box.includes(inviteUrl), "the complete URL must appear verbatim");
    assert.ok(!box.includes("..."), "nothing may be elided");
  });

  it("keeps every line the same width so the box actually closes", () => {
    const lines = box.trim().split("\n");
    const widths = new Set(lines.map((line) => [...line].length));
    assert.equal(widths.size, 1, `expected one width, got ${[...widths].join(", ")}`);
  });

  it("includes the recipient, role, scope and expiry", () => {
    assert.ok(box.includes("officer@example.com"));
    assert.ok(box.includes("dept_head"));
    assert.ok(box.includes("CDA"));
    assert.ok(box.includes("Roads & Infrastructure"));
    assert.ok(box.includes("2026-09-05 14:23 PKT"));
  });

  it("names the flag that produced it, so nobody mistakes dev mode for real email", () => {
    assert.ok(box.includes("EMAIL_ROUTING_ENABLED=false"));
  });

  it("omits org and dept lines for a platform admin, which genuinely has neither", () => {
    const adminBox = formatInviteBox({
      to: "admin@example.com",
      inviteUrl,
      role: "platform_admin",
      expiresAt: EXPIRES,
    });

    assert.ok(!adminBox.includes("Org:"), "an absent scope must not render as an empty field");
    assert.ok(!adminBox.includes("Dept:"));
  });

  it("uses no ANSI colour escapes, so it stays readable in a piped log or CI", () => {
    // 0x1B is the escape byte every ANSI colour sequence begins with.
    const ESC = String.fromCharCode(27);
    assert.ok(!box.includes(ESC));
  });
});
