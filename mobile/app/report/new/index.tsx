import * as React from "react";
import { useRouter } from "expo-router";

import { createReport } from "@/api/client";
import { Loading, Screen } from "@/components/ui";

/*
 * The one thing every "Report a problem" button in the app points at.
 *
 * No UI of its own — mirrors the web's /report/page.tsx exactly: create a
 * draft row server-side, then move straight to its first step. A citizen
 * never sees this screen; it's a beat of loading between tapping the button
 * and the camera opening.
 */
export default function NewReportEntry() {
  const router = useRouter();

  React.useEffect(() => {
    let cancelled = false;

    createReport()
      .then((report) => {
        if (!cancelled) router.replace(`/report/new/${report.id}/camera`);
      })
      .catch(() => {
        if (!cancelled) router.back();
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Screen>
      <Loading />
    </Screen>
  );
}
