"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LocateFixed, MapPinned } from "lucide-react";

import { ReportStepHeading } from "@/components/report/report-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import {
  ReportApiError,
  submitGpsLocation,
  submitManualLocation,
} from "@/lib/report/client";
import type { ReportDto } from "@/lib/report/schema";

const t = getDictionary();

type Mode = "choose" | "locating" | "confirm" | "manual" | "denied";

/*
 * Location is requested only here — never on app load, never in the
 * background — and only as a foreground, one-time read (navigator.geolocation
 * with no `watchPosition`), matching the brief's "foreground/when-in-use
 * only" rule.
 */
export function LocationFlow({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("choose");
  const [result, setResult] = React.useState<ReportDto | null>(null);
  const [manualLabel, setManualLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function useMyLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setMode("denied");
      return;
    }

    setMode("locating");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const updated = await submitGpsLocation(
            reportId,
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy ?? null,
          );
          setResult(updated);
          setMode("confirm");
        } catch (cause) {
          setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
          setMode("choose");
        }
      },
      () => setMode("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (!manualLabel.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await submitManualLocation(reportId, manualLabel.trim());
      router.push(`/report/${reportId}/review`);
    } catch (cause) {
      setError(cause instanceof ReportApiError ? cause.message : t.report.unexpectedError);
    } finally {
      setBusy(false);
    }
  }

  function proceedToReview() {
    router.push(`/report/${reportId}/review`);
  }

  if (mode === "confirm" && result) {
    return (
      <>
        <ReportStepHeading title={t.report.locationLabel} />
        {error ? <ErrorBanner message={error} /> : null}

        <div className="rounded-[18px] border border-civic-200 bg-civic-50 p-4">
          <div className="flex items-start gap-2.5">
            <MapPinned className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
            <div>
              <p className="text-[0.8125rem] font-semibold text-civic-900">{t.report.yourCurrentLocation}</p>
              <p className="mt-1 text-[0.9375rem] text-ink">
                {result.locationLabel ?? `${result.latitude?.toFixed(5)}, ${result.longitude?.toFixed(5)}`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <Button size="full" onClick={proceedToReview}>
            {t.report.confirmLocation}
          </Button>
          <Button variant="secondary" size="full" onClick={() => setMode("manual")}>
            {t.report.changeLocation}
          </Button>
        </div>
      </>
    );
  }

  if (mode === "manual" || mode === "denied") {
    return (
      <>
        <ReportStepHeading title={t.report.locationTitle} subtitle={t.report.locationSubtitle} />

        {mode === "denied" ? (
          <div className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3.5">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="text-[0.875rem] text-amber-900">{t.report.locationDeniedBody}</p>
          </div>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        <form onSubmit={submitManual} className="space-y-4">
          <Input
            value={manualLabel}
            onChange={(event) => setManualLabel(event.target.value)}
            placeholder={t.report.locationPlaceholder}
            dir="auto"
          />
          <Button type="submit" size="full" loading={busy} disabled={!manualLabel.trim()}>
            {t.report.confirmLocation}
          </Button>
        </form>
      </>
    );
  }

  if (mode === "locating") {
    return (
      <>
        <ReportStepHeading title={t.report.locationTitle} subtitle={t.report.locationSubtitle} />
        <div className="rounded-[20px] border border-line bg-surface p-10 text-center" role="status" aria-live="polite">
          <span className="relative mx-auto flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-civic-100 opacity-75" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-civic-100">
              <LocateFixed className="size-7 text-civic-700" aria-hidden="true" />
            </span>
          </span>
        </div>
      </>
    );
  }

  // -- choose -----------------------------------------------------------------
  return (
    <>
      <ReportStepHeading title={t.report.locationTitle} subtitle={t.report.locationSubtitle} />
      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex flex-col gap-2.5">
        <Button size="full" onClick={useMyLocation}>
          <LocateFixed className="size-4" aria-hidden="true" />
          {t.report.useMyLocation}
        </Button>
        <Button variant="secondary" size="full" onClick={() => setMode("manual")}>
          {t.report.enterLocationManually}
        </Button>
      </div>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-[18px] border border-danger/25 bg-danger-bg px-4 py-3">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="text-[0.875rem] text-danger">{message}</p>
    </div>
  );
}
