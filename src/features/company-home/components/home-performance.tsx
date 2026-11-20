import { useId } from "react";
import type { Overview } from "../lib/home";

/** An observed-data sparkline; gaps remain gaps rather than fabricated zeroes. */
export function HomePerformance({ performance }: { performance: Overview["performance"] }) {
  const titleId = useId();
  const known = performance.history.filter((p) => p.views !== null);
  if (performance.views === 0 && performance.history.length === 0) return null;
  if (known.length < 2 || performance.isPartial) {
    return (
      <p className="text-body-sm text-gray-500">
        {performance.isPartial ? "View totals are partial." : "View history is not available yet."}
      </p>
    );
  }
  const first = performance.history[0].at;
  const last = performance.history.at(-1)!.at;
  const min = Math.min(...known.map((p) => p.views!));
  const max = Math.max(...known.map((p) => p.views!));
  const points = performance.history.map((p) =>
    p.views === null
      ? null
      : {
          x: 6 + ((p.at - first) / (last - first || 1)) * 332,
          y: 48 - ((p.views - min) / (max - min || 1)) * 38,
        },
  );
  const segments: { x: number; y: number }[][] = [];
  for (const point of points) {
    if (point === null) {
      segments.push([]);
      continue;
    }
    if (!segments.length) segments.push([]);
    segments[segments.length - 1].push(point);
  }
  const end = points.at(-1);
  return (
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox="0 0 344 64"
      preserveAspectRatio="none"
      className="h-16 w-full overflow-visible"
    >
      <title id={titleId}>Observed post views this week</title>
      {segments
        .filter((s) => s.length > 1)
        .map((segment, index) => {
          const line = segment.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
          return (
            <g key={index}>
              <path
                d={`${line} L${segment.at(-1)!.x},58 L${segment[0].x},58 Z`}
                className="fill-blue-primary/10"
              />
              <path
                d={line}
                fill="none"
                className="stroke-blue-primary"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      {end && <circle cx={end.x} cy={end.y} r="4.5" className="fill-blue-primary" />}
    </svg>
  );
}
