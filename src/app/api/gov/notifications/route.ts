import { ok, withOfficer } from "@/lib/gov/api";
import { countUnread, listNotifications } from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/notifications — this officer's inbox.
 *
 * Scoped by the session's own officer id, never by a parameter, so there is no
 * id an officer could change to read somebody else's inbox.
 */
export const GET = withOfficer(async ({ officer }) => {
  const [items, unread] = await Promise.all([
    listNotifications(officer.id),
    countUnread(officer.id),
  ]);
  return ok({ items, unread });
});
