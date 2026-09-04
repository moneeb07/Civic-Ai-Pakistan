import { Stack } from "expo-router";

import { colors } from "@/theme";

/*
 * The report-creation wizard.
 *
 * Every screen draws its own header via ReportShell (brand + the named
 * 01/02/03/04 step bar), so the stack's own header stays off throughout —
 * same reasoning as app/register/_layout.tsx.
 *
 * No provider here, unlike registration: a report's state is the database row
 * itself, fetched and patched fresh by id on every step, so there is nothing
 * client-side to hold between screens or discard on exit.
 */
export default function NewReportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
