/** Largest value above zero, or 1 when there is none, so scales never divide by zero. */
export function positiveMax(values: number[]): number {
  let top = 0;
  for (const value of values) if (value > top) top = value;
  return top > 0 ? top : 1;
}

/** Heatmap step from 0 (none) to 4 (most), in quarters of the maximum. */
export function heatStep(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as 1 | 2 | 3 | 4;
}

/** A point in the 0–100 plot space of a stretched SVG: x then y, y growing downward. */
export type PlotPoint = [number, number];

/**
 * Fritsch–Carlson tangents for a monotone cubic through the points, so the
 * curve never overshoots the data. Slopes are clamped where α² + β² > 9.
 */
export function monotoneTangents(points: PlotPoint[]): number[] {
  const count = points.length;
  const slopes = points.slice(1).map((point, i) => {
    const previous = points[i];
    return (point[1] - previous[1]) / (point[0] - previous[0] || 1);
  });
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === count - 1) return slopes[count - 2];
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  });
  for (let i = 0; i < count - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const sum = alpha * alpha + beta * beta;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      tangents[i] = scale * alpha * slopes[i];
      tangents[i + 1] = scale * beta * slopes[i];
    }
  }
  return tangents;
}

/** The monotone curve from point `from` to point `to` (inclusive indexes). */
export function monotonePath(
  points: PlotPoint[],
  tangents: number[],
  from: number,
  to: number,
): string {
  let path = `M${points[from][0]},${points[from][1]}`;
  for (let i = from; i < to; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const third = (x1 - x0) / 3;
    path += ` C${x0 + third},${y0 + tangents[i] * third} ${x1 - third},${y1 - tangents[i + 1] * third} ${x1},${y1}`;
  }
  return path;
}

/** The monotone curve closed down to the plot's bottom edge, for the area under it. */
export function monotoneAreaPath(
  points: PlotPoint[],
  tangents: number[],
  from: number,
  to: number,
): string {
  return `${monotonePath(points, tangents, from, to)} L${points[to][0]},100 L${points[from][0]},100 Z`;
}
