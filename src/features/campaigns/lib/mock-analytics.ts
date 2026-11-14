/**
 * DEMO ONLY: made-up campaign and opportunity performance numbers.
 *
 * Views and posts will come from the X metrics sync, and spend from payouts;
 * neither is queryable yet, and the demo mustn't call the X API. Every chart
 * and stat reads through `mockAnalytics`, so replacing this one function with
 * a real query swaps the whole UI over. Numbers are derived from the ID, so
 * a card shows the same figures on every render.
 */
export type Analytics = {
  creators: number;
  posts: number;
  views: number;
  spendCents: number;
  /** Weekly views, oldest first. */
  weeklyViews: number[];
  weekLabels: string[];
};

function seeded(id: string): () => number {
  let state = [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

const WEEKS = 8;

export function mockAnalytics(id: string): Analytics {
  const random = seeded(id);
  const weeklyViews: number[] = [];
  let views = 2_000 + random() * 8_000;
  for (let week = 0; week < WEEKS; week++) {
    views *= 1 + (random() - 0.25) * 0.5;
    weeklyViews.push(Math.round(views));
  }
  const total = weeklyViews.reduce((sum, value) => sum + value, 0);
  const now = Date.now();
  const weekLabels = weeklyViews.map((_, index) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      now - (WEEKS - 1 - index) * 7 * 86_400_000,
    ),
  );
  return {
    creators: 3 + Math.floor(random() * 15),
    posts: 10 + Math.floor(random() * 40),
    views: total,
    spendCents: Math.round(total * (0.04 + random() * 0.06)) * 100,
    weeklyViews,
    weekLabels,
  };
}

/** `200k`, `1.2M`. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .toLowerCase();
}
