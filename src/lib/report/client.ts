"use client";

import type { CivicCategory, ReportDto, Severity, VisionResult } from "./schema";

/*
 * Thin, typed wrappers around /api/reports/* — kept in one place so every
 * report screen calls the API the same way and none of them re-implement
 * error-shape handling by hand.
 */

interface ApiFailure {
  success: false;
  reason?: string;
  message?: string;
}

export class ReportApiError extends Error {
  constructor(
    readonly reason: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ReportApiError";
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!payload.success) {
    const failure = payload as ApiFailure;
    throw new ReportApiError(failure.reason, failure.message ?? "Something went wrong.");
  }
  return payload.data as T;
}

export function createReportDraft(): Promise<ReportDto> {
  return fetch("/api/reports", { method: "POST" }).then((r) => unwrap<ReportDto>(r));
}

export function getReport(id: string): Promise<ReportDto> {
  return fetch(`/api/reports/${id}`).then((r) => unwrap<ReportDto>(r));
}

export function patchReport(
  id: string,
  values: Partial<{
    category: CivicCategory;
    visionConfirmed: boolean;
    title: string;
    description: string;
    severity: Severity;
    locationLabel: string;
  }>,
): Promise<ReportDto> {
  return fetch(`/api/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  }).then((r) => unwrap<ReportDto>(r));
}

export function uploadReportImage(id: string, blob: Blob): Promise<ReportDto> {
  const form = new FormData();
  form.append("image", blob, "report.jpg");
  return fetch(`/api/reports/${id}/image`, { method: "POST", body: form }).then((r) =>
    unwrap<ReportDto>(r),
  );
}

export function analyzeReportImage(
  id: string,
): Promise<{ report: ReportDto; vision: VisionResult }> {
  return fetch(`/api/reports/${id}/analyze-image`, { method: "POST" }).then((r) =>
    unwrap<{ report: ReportDto; vision: VisionResult }>(r),
  );
}

export function submitVoiceDescription(id: string, blob: Blob, mimeType: string): Promise<ReportDto> {
  const form = new FormData();
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
  form.append("audio", blob, `description.${extension}`);
  return fetch(`/api/reports/${id}/transcript`, { method: "POST", body: form }).then((r) =>
    unwrap<ReportDto>(r),
  );
}

export function submitTextDescription(id: string, text: string): Promise<ReportDto> {
  return fetch(`/api/reports/${id}/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then((r) => unwrap<ReportDto>(r));
}

export function submitGpsLocation(
  id: string,
  latitude: number,
  longitude: number,
  accuracyMeters: number | null,
): Promise<ReportDto> {
  return fetch(`/api/reports/${id}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "gps", latitude, longitude, accuracyMeters }),
  }).then((r) => unwrap<ReportDto>(r));
}

export function submitManualLocation(id: string, label: string): Promise<ReportDto> {
  return fetch(`/api/reports/${id}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "manual", label }),
  }).then((r) => unwrap<ReportDto>(r));
}

export function generateComplaint(id: string): Promise<ReportDto> {
  return fetch(`/api/reports/${id}/generate`, { method: "POST" }).then((r) =>
    unwrap<ReportDto>(r),
  );
}

export function confirmReport(id: string): Promise<ReportDto> {
  return fetch(`/api/reports/${id}/confirm`, { method: "POST" }).then((r) =>
    unwrap<ReportDto>(r),
  );
}
