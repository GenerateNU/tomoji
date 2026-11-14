import type { FollowerRange } from "@convex/models/followerRanges";
import { FOLLOWER_RANGES } from "@convex/models/followerRanges";

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

/**
 * A follower range as readers expect it: "Under 1K", "100K – 500K", "500K+".
 * The bounds come from the ranges themselves: each one ends where the next begins.
 */
export function formatFollowerRange(name: FollowerRange): string {
  const index = FOLLOWER_RANGES.findIndex((range) => range.name === name);
  if (index === -1) return name;
  const range = FOLLOWER_RANGES[index];
  const next = FOLLOWER_RANGES[index + 1];
  if (range.minFollowers === 0) return `Under ${compact.format(next.minFollowers)}`;
  if (next === undefined) return `${compact.format(range.minFollowers)}+`;
  return `${compact.format(range.minFollowers)} – ${compact.format(next.minFollowers)}`;
}
