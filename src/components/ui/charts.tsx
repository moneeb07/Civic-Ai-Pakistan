import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/*
 * Charts, hand-drawn in SVG.
 *
 * No charting library, deliberately. The product needs exactly three forms — a
 * part-to-whole donut, a magnitude bar, and a two-series trend — and the
 * smallest credible library costs more transferred bytes than every one of
 * these components put together, on connections where that actually matters.
 * The existing resolution-donut.tsx already set this precedent.
 *
 * Rules these all follow:
 *
 * - One scale places the marks, the ticks AND the labels, so a label can never
 *   name a value the drawing does not reach.
 * - Every axis label names a real gridline; no decorative ticks.
 * - The viewBox leaves room for the outermost labels, so nothing is clipped.
 * - Marks are separated by a 2px surface gap rather than a stroke, so adjacent
 *   fills stay distinct without adding a colour.
 * - Text takes ink tokens, never the series colour — the mark beside it carries
 *   identity. Colour is never the only channel: every series is either directly
 *   labelled or in a legend.
 */

/** A titled frame so every chart on a page has the same header treatment. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle ? <p className="text-[0.8125rem] text-muted">{subtitle}</p> : null}
        {action ? <div className="ms-auto">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/* ==========================================================================
 * Donut — part of a whole, few slices
 * ======================================================================== */

export interface DonutSlice {
  label: string;
  value: number;
  /** A CSS colour. Callers pass status tokens via getComputedStyle-free literals. */
  color: string;
}

/**
 * A donut for a small number of parts.
 *
 * Legend is always rendered beside it with the value spelled out, so the chart
 * never depends on a reader distinguishing two arcs by colour alone.
 */
export function Donut({
  slices,
  centerValue,
  centerLabel,
  size = 148,
}: {
  slices: DonutSlice[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  /*
   * Arc geometry, computed without mutation.
   *
   * A running total accumulated inside the render map is what the React
   * Compiler refuses to memoise, and it is a real hazard rather than a lint
   * nicety: a re-render that re-enters the map without resetting the
   * accumulator draws every slice at the wrong angle. Slice counts here are
   * single digits, so summing the preceding arcs per slice costs nothing.
   */
  const arcLength = (value: number) =>
    total > 0 ? (value / total) * circumference : 0;

  const arcs = slices.map((slice, index) => ({
    slice,
    // 2px gap between adjacent fills, per the mark spec.
    drawn: Math.max(0, arcLength(slice.value) - 2),
    offset: -slices
      .slice(0, index)
      .reduce((sum, previous) => sum + arcLength(previous.value), 0),
  }));

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        viewBox="0 0 140 140"
        style={{ width: size, height: size }}
        className="shrink-0"
        role="img"
        aria-label={`${centerValue} ${centerLabel}: ${slices
          .map((s) => `${s.value} ${s.label}`)
          .join(", ")}`}
      >
        <g transform="rotate(-90 70 70)" fill="none" strokeWidth="19">
          {/* Track, so a mostly-empty donut still reads as a ring. */}
          <circle cx="70" cy="70" r={radius} className="stroke-canvas" />
          {arcs.map(({ slice, drawn, offset }) => (
            <circle
              key={slice.label}
              cx="70"
              cy="70"
              r={radius}
              stroke={slice.color}
              strokeDasharray={`${drawn} ${circumference - drawn}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          ))}
        </g>

        <text
          x="70"
          y="68"
          textAnchor="middle"
          className="fill-ink text-[1.75rem] font-bold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {centerValue}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-muted text-[0.625rem]">
          {centerLabel}
        </text>
      </svg>

      <ul className="min-w-[9rem] flex-1 space-y-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[0.8125rem]">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-muted">{slice.label}</span>
            <span className="ms-auto font-semibold tabular-nums text-ink">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
 * Bars — magnitude across a category or a time bucket
 * ======================================================================== */

export interface BarDatum {
  label: string;
  value: number;
  /** Marks the bar worth pointing at — the peak, or the current period. */
  emphasis?: boolean;
}

/**
 * A single-series vertical bar chart.
 *
 * One series, so no legend: the card's title names it. The peak bar is filled
 * darker and directly labelled, which is the only number printed on the plot —
 * a value on every bar is noise, and the axis already carries the scale.
 */
export function BarChart({
  data,
  max,
  height = 150,
}: {
  data: BarDatum[];
  /** Fixed ceiling, so a chart can keep a stable scale across renders. */
  max?: number;
  height?: number;
}) {
  const ceiling = max ?? Math.max(...data.map((d) => d.value), 1);
  const plotTop = 12;
  const plotBottom = 112;
  const plotHeight = plotBottom - plotTop;

  const left = 34;
  const usable = 400 - left;
  const slot = usable / data.length;
  const barWidth = Math.min(30, slot * 0.62);

  const y = (value: number) => plotBottom - (value / ceiling) * plotHeight;

  // Three gridlines: 0, half, full. Every one is labelled with a real value.
  const ticks = [0, ceiling / 2, ceiling];

  return (
    <svg
      viewBox="0 0 400 146"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} y1={y(tick)} x2="396" y2={y(tick)} className="stroke-line" strokeWidth="1" />
          <text
            x={left - 6}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-muted text-[0.5625rem]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {Math.round(tick)}
          </text>
        </g>
      ))}

      {data.map((datum, index) => {
        const barX = left + slot * index + (slot - barWidth) / 2;
        const barY = y(datum.value);

        return (
          <g key={datum.label}>
            <rect
              x={barX}
              y={barY}
              width={barWidth}
              height={Math.max(0, plotBottom - barY)}
              rx="4"
              className={datum.emphasis ? "fill-civic-600" : "fill-civic-500"}
            />
            {datum.emphasis ? (
              <text
                x={barX + barWidth / 2}
                y={barY - 5}
                textAnchor="middle"
                className="fill-ink text-[0.5625rem] font-bold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {datum.value}
              </text>
            ) : null}
            <text
              x={barX + barWidth / 2}
              y={plotBottom + 14}
              textAnchor="middle"
              className="fill-muted text-[0.5625rem]"
            >
              {datum.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ==========================================================================
 * Horizontal bars — ranking a handful of named things
 * ======================================================================== */

/**
 * Ranked rows with a labelled proportion bar.
 *
 * Preferred over a vertical bar chart whenever the categories are NAMES rather
 * than time buckets: names read horizontally, and rotating them 45° to fit a
 * vertical axis is the most common way a readable chart is made unreadable.
 */
export function RankedBars({
  data,
  unit,
}: {
  data: { label: string; value: number; caption?: string }[];
  unit?: string;
}) {
  const ceiling = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-3.5">
      {data.map((datum) => (
        <li key={datum.label}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="font-medium text-ink">{datum.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {datum.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
          <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-canvas">
            <span
              className="block h-full rounded-full bg-civic-500"
              style={{ width: `${(datum.value / ceiling) * 100}%` }}
            />
          </span>
          {datum.caption ? (
            <p className="mt-1 text-[0.75rem] text-muted">{datum.caption}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ==========================================================================
 * Trend — two series over time
 * ======================================================================== */

export interface TrendSeries {
  name: string;
  color: string;
  points: number[];
  /** Dashed, for the series that trails the other. */
  dashed?: boolean;
}

/**
 * A two-series line chart on ONE shared scale.
 *
 * Never a second y-axis: two scales on one plot let any pair of lines be made
 * to cross wherever the author likes, which is the single most misleading
 * thing a chart can do. Both series here are counts of issues, so one axis is
 * also the honest choice.
 */
export function TrendChart({
  series,
  labels,
  height = 170,
}: {
  series: [TrendSeries, TrendSeries];
  labels: string[];
  height?: number;
}) {
  const ceiling = Math.max(...series.flatMap((s) => s.points), 1);
  const plotTop = 16;
  const plotBottom = 132;
  const left = 30;
  const right = 436;

  const x = (index: number) =>
    labels.length > 1 ? left + (index / (labels.length - 1)) * (right - left) : left;
  const y = (value: number) => plotBottom - (value / ceiling) * (plotBottom - plotTop);

  const ticks = [0, ceiling / 2, ceiling];

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 446 152"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={series
          .map((s) => `${s.name}: ${s.points.join(", ")}`)
          .join(". ")}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} y1={y(tick)} x2={right} y2={y(tick)} className="stroke-line" strokeWidth="1" />
            <text
              x={left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-muted text-[0.5625rem]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {series.map((line) => (
          <g key={line.name}>
            <polyline
              points={line.points.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.dashed ? "5 4" : undefined}
            />
            {line.points.map((value, index) => (
              <circle
                key={index}
                cx={x(index)}
                cy={y(value)}
                // The final point is enlarged: "where did this end up" is the
                // question a trend is usually asked.
                r={index === line.points.length - 1 ? 4 : 2.5}
                fill={line.color}
                // 2px surface ring keeps overlapping marks separable.
                className="stroke-surface"
                strokeWidth="2"
              />
            ))}
          </g>
        ))}

        {labels.map((label, index) => (
          <text
            key={label}
            x={x(index)}
            y={plotBottom + 16}
            textAnchor="middle"
            className="fill-muted text-[0.5625rem]"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Two series, so a legend is mandatory — identity is never colour alone. */}
      <figcaption className="mt-1 flex flex-wrap gap-4">
        {series.map((line) => (
          <span key={line.name} className="flex items-center gap-1.5 text-[0.75rem] text-muted">
            <svg width="14" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="14"
                y2="2"
                stroke={line.color}
                strokeWidth="2.5"
                strokeDasharray={line.dashed ? "4 3" : undefined}
              />
            </svg>
            {line.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
