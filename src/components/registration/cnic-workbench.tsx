"use client";

import * as React from "react";
import { Check, CircleAlert, IdCard, ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The CNIC verification workbench.
 *
 * The layout the reference asks for, and a genuine improvement on what it
 * replaces: scanning on the left, and on the right a running record of what
 * has actually been captured and read so far.
 *
 * The reason it matters is not decoration. The previous flow was one thing per
 * screen — photograph the front, then photograph the back, then finally see
 * what was read — so a citizen had no idea whether their front photo had
 * worked until both were done and the extraction came back. Showing both sides
 * and their state side by side means a failed side is visible the moment it
 * fails, next to the camera that can fix it.
 *
 * On a phone the two columns stack, scanner first: a person holding a card up
 * to a lens needs the viewfinder, not a summary panel.
 */

export type SideState = "pending" | "capturing" | "captured" | "failed";

interface SideStatus {
  state: SideState;
  /** Thumbnail of what was captured, once there is one. */
  dataUrl?: string | null;
  detail?: string;
}

/** The three guidance states, shown as a legend beside the scanner. */
const GUIDANCE = [
  {
    tone: "red" as const,
    title: "Not readable",
    body: "Hold the card steady, or move it closer.",
  },
  {
    tone: "orange" as const,
    title: "Improve the image",
    body: "Better light, less glare, card flat to the camera.",
  },
  {
    tone: "green" as const,
    title: "Ready",
    body: "The details are clear. We capture automatically.",
  },
];

const DOT = {
  red: "bg-status-reported",
  orange: "bg-status-process",
  green: "bg-status-resolved",
};

export function CnicWorkbench({
  scanner,
  front,
  back,
  fields,
  title,
  subtitle,
}: {
  /** The live capture control for whichever side is being taken. */
  scanner: React.ReactNode;
  front: SideStatus;
  back: SideStatus;
  /** Extracted values, once there are any. */
  fields?: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* -- Scanning ---------------------------------------------------- */}
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-[12px] bg-civic-50 text-civic-700">
            <ScanLine className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">{title}</h2>
            <p className="text-[0.8125rem] text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4">{scanner}</div>

        {/*
          The legend is stated up front rather than only appearing once
          something has gone wrong. Somebody who knows the camera fires itself
          when the border turns green stops fighting the shutter button.
        */}
        <ul className="mt-4 grid gap-2.5 border-t border-line pt-4">
          {GUIDANCE.map((entry) => (
            <li key={entry.tone} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[entry.tone])}
              />
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold text-ink">
                  {entry.title}
                </span>
                <span className="block text-[0.75rem] leading-relaxed text-muted">
                  {entry.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* -- What we have so far ------------------------------------------ */}
      <section className="min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <SideCard label="CNIC · Front" hint="Name, number, dates" status={front} />
          <SideCard label="CNIC · Back" hint="Present & permanent address" status={back} />
        </div>

        {fields ? <div className="mt-4">{fields}</div> : null}
      </section>
    </div>
  );
}

function SideCard({
  label,
  hint,
  status,
}: {
  label: string;
  hint: string;
  status: SideStatus;
}) {
  const { state, dataUrl, detail } = status;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface",
        state === "captured" && "border-status-resolved-line",
        state === "failed" && "border-status-reported-line",
        state === "capturing" && "border-civic-500",
        state === "pending" && "border-dashed border-line-strong",
      )}
    >
      {/*
        A fixed CNIC-proportioned well, so the two cards keep the same shape
        whether or not a photograph exists yet — the layout must not jump as
        each side is captured.
      */}
      <div className="relative flex aspect-[1.586/1] items-center justify-center bg-canvas">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`${label} captured`} className="size-full object-cover" />
        ) : (
          <IdCard className="size-7 text-line-strong" aria-hidden="true" />
        )}

        {state === "captured" ? (
          <span className="absolute end-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-status-resolved text-white">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
        {state === "failed" ? (
          <span className="absolute end-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-status-reported text-white">
            <CircleAlert className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <p className="text-[0.8125rem] font-semibold text-ink">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-[0.75rem] leading-relaxed",
            state === "failed" ? "text-status-reported" : "text-muted",
          )}
        >
          {detail ??
            (state === "captured"
              ? "Captured and readable"
              : state === "capturing"
                ? "Scanning now…"
                : hint)}
        </p>
      </div>
    </div>
  );
}
