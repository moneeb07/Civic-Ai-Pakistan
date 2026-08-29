import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { locationPayloadSchema } from "@/lib/report/schema";
import { getOwnedReportRow, updateOwnedReport } from "@/lib/report/store";
import { getGeocodingProvider } from "@/services/geocoding/reverse-geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/reports/[id]/location
 *
 *   { mode: "gps", latitude, longitude, accuracyMeters? } -> reverse-geocoded
 *     server-side (keeps the geocoding call, and its API surface, off the
 *     browser). If geocoding fails, the raw coordinates are still saved —
 *     never a fabricated address — and the citizen is asked to confirm or
 *     type a location themselves instead.
 *   { mode: "manual", label } -> exactly what the citizen typed, no lookup.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  const { id } = await params;
  const report = await getOwnedReportRow(id, session.user.id);
  if (!report) {
    return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "We couldn't read that request." }, { status: 400 });
  }

  const parsed = locationPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Please provide a location." }, { status: 400 });
  }

  const value = parsed.data;

  if (value.mode === "manual") {
    const updated = await updateOwnedReport(id, session.user.id, {
      latitude: null,
      longitude: null,
      locationAccuracyMeters: null,
      locationLabel: value.label,
      locationSource: "manual",
    });
    return NextResponse.json({ success: true, data: updated });
  }

  const geocoded = await getGeocodingProvider().reverseGeocode(value.latitude, value.longitude);

  const updated = await updateOwnedReport(id, session.user.id, {
    latitude: value.latitude,
    longitude: value.longitude,
    locationAccuracyMeters: value.accuracyMeters ?? null,
    // Never fabricated: coordinates alone if the lookup failed, so the
    // citizen sees exactly what is and isn't known rather than a guessed
    // address, and can still type one in themselves.
    locationLabel: geocoded?.formattedAddress ?? null,
    locationSource: "gps",
  });

  return NextResponse.json({
    success: true,
    data: updated,
    geocoded: Boolean(geocoded?.formattedAddress),
  });
}
