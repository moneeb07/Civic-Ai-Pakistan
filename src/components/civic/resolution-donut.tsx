/*
 * A donut showing how a caseload is split across the three stages.
 *
 * Inline SVG rather than a charting library: three arcs need no dependency,
 * and a chart that renders on the server has no loading state to design
 * around. Colours are the same red/amber/green used everywhere else, so the
 * chart needs no legend to be understood — though it has one anyway.
 */
export function ResolutionDonut({
  reported,
  inProcess,
  resolved,
  size = 168,
}: {
  reported: number;
  inProcess: number;
  resolved: number;
  size?: number;
}) {
  const total = reported + inProcess + resolved;
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { value: resolved, colour: "#006a4e", label: "Resolved" },
    { value: inProcess, colour: "#f59e0b", label: "In process" },
    { value: reported, colour: "#b4231f", label: "Reported" },
  ];

  let offset = 0;
  const rate = total === 0 ? 0 : Math.round((resolved / total) * 100);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${resolved} of ${total} issues resolved`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e4ede8"
          strokeWidth={16}
        />

        {total > 0
          ? segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.colour}
                  strokeWidth={16}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  // Start at 12 o'clock rather than 3, which is what people expect.
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += length;
              return element;
            })
          : null}

        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-ink"
          style={{ fontSize: 26, fontWeight: 700 }}
        >
          {rate}%
        </text>
        <text
          x="50%"
          y="61%"
          textAnchor="middle"
          className="fill-muted"
          style={{ fontSize: 11, letterSpacing: "0.08em" }}
        >
          RESOLVED
        </text>
      </svg>

      <ul className="space-y-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-[0.8125rem]">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: segment.colour }}
              aria-hidden="true"
            />
            <span className="text-muted">{segment.label}</span>
            <span className="font-semibold text-ink">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
