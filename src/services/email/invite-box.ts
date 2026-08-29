/*
 * The terminal invite block, kept separate from invite-mailer.ts so it is a
 * pure function with no "server-only" import and can be unit-tested directly
 * (see tests/gov-invite-mailer.test.ts) — the same split the citizen side
 * uses for report-image.ts / report-image-utils.ts.
 *
 * Plain box-drawing characters and no ANSI colour: this has to stay readable
 * in a CI log, a piped file and a terminal that doesn't do colour.
 */

export interface InviteBoxInput {
  to: string;
  inviteUrl: string;
  role: string;
  orgName?: string;
  deptName?: string;
  expiresAt: Date;
}

const MIN_WIDTH = 72;

/** Pakistan Standard Time, so the expiry an operator reads matches the one they'd quote to the invitee. */
export function formatPktTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} PKT`;
}

/*
 * The box widens to fit the invite URL rather than truncating it.
 *
 * This matters more than a tidy fixed width: a 32-byte token renders as 64 hex
 * characters, so a 72-column box would clip the one string the whole message
 * exists to deliver. A clipped link is not an invite. The URL contains no
 * spaces, so it stays double-click selectable inside the borders.
 */
export function formatInviteBox(input: InviteBoxInput): string {
  const width = Math.max(MIN_WIDTH, input.inviteUrl.length + 2);
  const inner = width - 2;

  const row = (content: string): string => {
    const text = content.length > inner ? `${content.slice(0, inner - 3)}...` : content;
    return `║ ${text.padEnd(inner)} ║`;
  };

  const labelled = (label: string, value: string): string => row(`${label.padEnd(10)} ${value}`);

  const lines: string[] = [
    `╔${"═".repeat(width)}╗`,
    row("CIVICAI — GOV PORTAL INVITE (dev mode, EMAIL_ROUTING_ENABLED=false)"),
    `╠${"═".repeat(width)}╣`,
    labelled("To:", input.to),
    labelled("Role:", input.role),
  ];

  // Scope lines are omitted rather than shown empty: a platform admin invite
  // genuinely has no org or dept, and "Org: —" would imply one was expected.
  if (input.orgName) lines.push(labelled("Org:", input.orgName));
  if (input.deptName) lines.push(labelled("Dept:", input.deptName));

  lines.push(
    labelled("Expires:", formatPktTimestamp(input.expiresAt)),
    row(""),
    row("Invite link (copy into browser):"),
    row(input.inviteUrl),
    `╚${"═".repeat(width)}╝`,
  );

  return `\n${lines.join("\n")}\n`;
}
