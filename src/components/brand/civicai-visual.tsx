import { cn } from "@/lib/utils";

/*
 * An abstract civic grid: streets, blocks and a few report markers.
 * Not a map of any real place, not a photograph, not an illustration of a robot.
 *
 * It sits far behind the content, fades out before it reaches the headline so
 * text always wins on contrast, and never animates.
 */
export function CivicAIVisual({ className }: { className?: string }) {
  // Blocks sit on grid intersections so the composition reads as city fabric
  // rather than as shapes scattered at random.
  const blocks = [
    { x: 112, y: 104, w: 40, h: 40 },
    { x: 176, y: 48, w: 32, h: 40 },
    { x: 240, y: 112, w: 40, h: 32 },
    { x: 112, y: 176, w: 32, h: 32 },
    { x: 288, y: 48, w: 32, h: 56 },
  ];

  const markers = [
    { x: 208, y: 144 },
    { x: 96, y: 88 },
    { x: 272, y: 200 },
  ];

  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* Fades the whole scene out towards the lower-left, keeping the
            headline area clean. */}
        <radialGradient id="civic-fade" cx="0.62" cy="0.16" r="0.95">
          <stop offset="0%" stopColor="white" stopOpacity="0.30" />
          <stop offset="45%" stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="civic-mask">
          <rect width="400" height="400" fill="url(#civic-fade)" />
        </mask>
      </defs>

      <g mask="url(#civic-mask)">
        {/* Secondary grid — a regular 32px street lattice. */}
        <g stroke="white" strokeWidth="0.75" strokeOpacity="0.45">
          {Array.from({ length: 13 }, (_, i) => i * 32).map((v) => (
            <path key={`g${v}`} d={`M0 ${v}h400M${v} 0v400`} />
          ))}
        </g>

        {/* Arterial roads */}
        <g stroke="white" strokeWidth="1.75" strokeOpacity="0.75">
          <path d="M0 144h400M0 256h400M96 0v400M272 0v400" />
        </g>

        {/* A diagonal route, as real cities have */}
        <path
          d="M0 328 L168 160 L400 64"
          stroke="white"
          strokeWidth="1.5"
          strokeOpacity="0.55"
        />

        {/* City blocks */}
        <g stroke="white" strokeWidth="0.75" strokeOpacity="0.6" fill="white" fillOpacity="0.06">
          {blocks.map((b) => (
            <rect
              key={`${b.x}-${b.y}`}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx="3"
            />
          ))}
        </g>

        {/* Report markers — where a citizen has spoken up. */}
        {markers.map((m) => (
          <g key={`${m.x}-${m.y}`}>
            <circle cx={m.x} cy={m.y} r="16" fill="white" fillOpacity="0.09" />
            <circle cx={m.x} cy={m.y} r="7" fill="white" fillOpacity="0.18" />
            <circle cx={m.x} cy={m.y} r="3" fill="white" fillOpacity="0.75" />
          </g>
        ))}
      </g>
    </svg>
  );
}
