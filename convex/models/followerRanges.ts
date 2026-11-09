import type { Infer } from "convex/values";
import type { followerRange } from "../schemas/creators.schema";

export type FollowerRange = Infer<typeof followerRange>;

/**
 * Follower ranges in ascending order. `minFollowers` is the range's lower bound;
 * `typicalFollowers` is a representative count on a log scale (roughly the
 * geometric middle), used to measure how far a creator falls short of a minimum.
 */
export const FOLLOWER_RANGES = [
  { name: "under-1k", label: "Under 1K", minFollowers: 0, typicalFollowers: 300 },
  { name: "1k-5k", label: "1K–5K", minFollowers: 1_000, typicalFollowers: 2_200 },
  { name: "5k-10k", label: "5K–10K", minFollowers: 5_000, typicalFollowers: 7_000 },
  { name: "10k-50k", label: "10K–50K", minFollowers: 10_000, typicalFollowers: 22_000 },
  { name: "50k-100k", label: "50K–100K", minFollowers: 50_000, typicalFollowers: 70_000 },
  { name: "100k-500k", label: "100K–500K", minFollowers: 100_000, typicalFollowers: 220_000 },
  { name: "500k-plus", label: "500K+", minFollowers: 500_000, typicalFollowers: 1_000_000 },
] as const satisfies readonly {
  name: FollowerRange;
  label: string;
  minFollowers: number;
  typicalFollowers: number;
}[];

function rangeOf(name: FollowerRange) {
  const range = FOLLOWER_RANGES.find((entry) => entry.name === name);
  if (range === undefined) throw new Error(`unknown follower range ${name}`);
  return range;
}

/**
 * How well a creator's reach meets an opportunity's minimum, from 0 to 1.
 * Meeting the minimum scores 1; below it, the score drops by 1 for every 10x
 * short. Ranges are uneven, so the gap is measured in followers, not in steps.
 * A creator who hasn't picked a range is treated as under 1K, like most creators.
 */
export function followerRangeFit(
  creatorRange: FollowerRange | undefined,
  minimum: FollowerRange,
): number {
  const creator = rangeOf(creatorRange ?? "under-1k");
  const required = rangeOf(minimum);
  if (creator.minFollowers >= required.minFollowers) return 1;
  return Math.max(0, 1 - Math.log10(required.minFollowers / creator.typicalFollowers));
}
