import type { ReactNode } from "react";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Every dashboard route is behind a real, database-verified session.
 * The proxy layer only removes the page flash; this is the actual guard.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireSession();

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
