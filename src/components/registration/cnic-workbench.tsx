"use client";

import * as React from "react";
import Image from "next/image";
import { Check, CircleAlert, Camera, FileText, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The CNIC verification workbench.
 *
 * Three columns, following the reference: what to do on the left, the camera
 * in the middle, and on the right a panel showing BOTH sides of the card.
 *
 * The right-hand panel does double duty, and that is the point of it. Before a
 * side has been photographed it shows a specimen card, so the citizen can see
 * exactly which face is wanted — the one with the photograph, or the one with
 * the address — rather than parsing a sentence about it. The moment a side is
 * captured, that citizen's own photograph replaces the specimen and takes a
 * tick. So the same panel answers "what am I looking for?" before, and "did
 * that work?" after.
 *
 * That second half matters more than it sounds. The flow this replaced was one
 * thing per screen — photograph the front, photograph the back, and only then
 * discover what was read — so a bad front photo stayed invisible until both
 * were done. Here a failed side is visible the moment it fails, beside the
 * camera that can fix it.
 *
 * On a phone the columns stack in the order that actually helps: the title, so
 * the citizen knows where they are, then the camera, then the checklist, then
 * the specimen. Explicit grid placement keeps the desktop arrangement (title
 * and checklist sharing the left column) without the DOM order having to
 * fight it — nothing is reordered away from what a screen reader announces.
 */

export type SideState = "pending" | "capturing" | "captured" | "failed";

interface SideStatus {
  state: SideState;
  /** Thumbnail of what was captured, once there is one. */
  dataUrl?: string | null;
  detail?: string;
}

/** What actually makes a scan succeed, in the order it goes wrong. */
const TIPS = [
  { icon: FileText, text: "Rest the card on a flat surface in even light." },
  { icon: Camera, text: "Fill the frame with the card and hold it steady." },
  { icon: FileText, text: "Front carries your name, number and dates." },
  { icon: FileText, text: "Back carries your present and permanent address." },
];

/** The three guidance states the live border uses, stated before they happen. */
const GUIDANCE = [
  { tone: "red" as const, title: "Not readable", body: "Hold the card steady, or move it closer." },
  { tone: "orange" as const, title: "Improve the image", body: "Better light, less glare, card flat on." },
  { tone: "green" as const, title: "Ready", body: "Details are clear. We capture automatically." },
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
  heading,
}: {
  /** The live capture control for whichever side is being taken. */
  scanner: React.ReactNode;
  front: SideStatus;
  back: SideStatus;
  /** Extracted values, once there are any. */
  fields?: React.ReactNode;
  title: string;
  subtitle: string;
  /** The step's own title block, which belongs at the top of the left column. */
  heading?: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.2fr)_minmax(0,0.86fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
      {/* -- Title ---------------------------------------------------------- */}
      {heading ? (
        <div className="order-1 min-w-0 xl:order-none xl:col-start-1 xl:row-start-1">
          {heading}
        </div>
      ) : null}

      {/* -- What to do ---------------------------------------------------- */}
      <div className="order-3 min-w-0 xl:order-none xl:col-start-1 xl:row-start-2">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-civic-700">
            For the best result
          </h2>

          <ul className="mt-3.5 grid gap-3">
            {TIPS.map((tip) => {
              const Icon = tip.icon;
              return (
                <li key={tip.text} className="flex items-start gap-2.5">
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-civic-600"
                    aria-hidden="true"
                  />
                  <span className="text-[0.875rem] leading-relaxed text-ink">
                    {tip.text}
                  </span>
                </li>
              );
            })}
          </ul>

          {/*
            The legend is stated up front rather than appearing only once
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
      </div>

      {/* -- The camera ---------------------------------------------------- */}
      <section className="order-2 min-w-0 xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">{title}</h2>
            <p className="text-[0.8125rem] text-muted">{subtitle}</p>
          </div>

          <div className="mt-4">{scanner}</div>
        </div>

        {fields ? <div className="mt-4">{fields}</div> : null}
      </section>

      {/* -- Reference documents ------------------------------------------- */}
      <aside className="order-4 min-w-0 xl:order-none xl:col-start-3 xl:row-span-2 xl:row-start-1">
        <div className="rounded-[var(--radius-card)] border border-civic-200 bg-civic-50 p-4">
          <h2 className="text-center text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-civic-700">
            Reference documents
          </h2>

          <div className="mt-4 grid gap-4">
            <ReferenceSide
              label="CNIC · Front"
              hint="Name, number, dates"
              specimen="/cnic-front.webp"
              status={front}
            />
            <ReferenceSide
              label="CNIC · Back"
              hint="Present & permanent address"
              specimen="/cnic-back.webp"
              status={back}
            />
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-civic-900/70">
            <HelpCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {/*
              Said plainly, because a specimen card that looks this real invites
              exactly the wrong conclusion.
            */}
            A specimen card, shown as a guide. Your own photograph replaces it
            once each side is captured.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ReferenceSide({
  label,
  hint,
  specimen,
  status,
}: {
  label: string;
  hint: string;
  specimen: string;
  status: SideStatus;
}) {
  const { state, dataUrl, detail } = status;
  const captured = Boolean(dataUrl);

  return (
    <div>
      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] border bg-surface",
          state === "captured" && "border-status-resolved",
          state === "failed" && "border-status-reported",
          state === "capturing" && "border-civic-500 ring-2 ring-civic-500/20",
          state === "pending" && "border-line-strong",
        )}
      >
        {/*
          A fixed ID-1 well (85.6 x 54mm), so the two cards keep the same shape
          whether or not a photograph exists yet — the layout must not jump as
          each side is captured.
        */}
        <div className="relative flex aspect-[1.586/1] items-center justify-center">
          {captured ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl as string}
              alt={`Your ${label}, as captured`}
              className="size-full object-cover"
            />
          ) : (
            <Image
              src={specimen}
              alt={`Specimen Pakistani CNIC, ${label}`}
              fill
              sizes="280px"
              className="object-cover"
            />
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
      </div>

      <p className="mt-2 text-center text-[0.8125rem] font-semibold text-ink">{label}</p>
      <p
        className={cn(
          "text-center text-[0.75rem] leading-relaxed",
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
  );
}
