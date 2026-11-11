/** A point in a chart's 0–1 space: x from left to right, y from bottom to top. */
export type ChartPoint = { x: number; y: number };

/** Chart drawings use a fixed 1000-wide box stretched to fit; strokes don't scale. */
export const VIEW_WIDTH = 1000;

function toView(point: ChartPoint, height: number) {
  return { x: point.x * VIEW_WIDTH, y: (1 - point.y) * height };
}

/**
 * A smooth line through the points. Each segment leaves and arrives level
 * (Figma's horizontal-tangent curves), so the line never overshoots the data.
 */
export function smoothLinePath(points: ChartPoint[], height: number): string {
  const view = points.map((point) => toView(point, height));
  return view
    .map((point, index) => {
      if (index === 0) return `M${point.x},${point.y}`;
      const previous = view[index - 1];
      const midX = (previous.x + point.x) / 2;
      return `C${midX},${previous.y} ${midX},${point.y} ${point.x},${point.y}`;
    })
    .join(" ");
}

/** The smooth line closed down to the baseline, for the shaded area under it. */
export function smoothAreaPath(points: ChartPoint[], height: number): string {
  if (points.length === 0) return "";
  const first = toView(points[0], height);
  const last = toView(points[points.length - 1], height);
  return `${smoothLinePath(points, height)} L${last.x},${height} L${first.x},${height} Z`;
}

/** Heatmap step from 0 (none) to 4 (most), in quarters of the maximum. */
export function heatStep(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as 1 | 2 | 3 | 4;
}
