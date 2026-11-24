import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type CreatorPostList = FunctionReturnType<typeof api.posts.listMine>;
export type CreatorPost = CreatorPostList["posts"][number];

/** Engagement counts X reports as current totals only, with no history to chart. */
export type EngagementMetric = "likes" | "comments" | "reposts" | "quotes";

export const ENGAGEMENT_LABELS: Record<EngagementMetric, string> = {
  likes: "Likes",
  comments: "Comments",
  reposts: "Reposts",
  quotes: "Quotes",
};

export type PostSortKey = "name" | "opportunity" | "postedAt" | "earnings";
export type PostSort = { key: PostSortKey; direction: "ascending" | "descending" };

type Sortable = Pick<CreatorPost, "title" | "opportunityTitle" | "postedAt" | "earnings">;

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** A sorted copy for the All posts table. */
export function sortPosts<Row extends Sortable>(posts: readonly Row[], sort: PostSort): Row[] {
  const compare = (a: Row, b: Row): number => {
    switch (sort.key) {
      case "name":
        return collator.compare(a.title, b.title);
      case "opportunity":
        return collator.compare(a.opportunityTitle, b.opportunityTitle);
      case "postedAt":
        return a.postedAt - b.postedAt;
      case "earnings":
        return a.earnings - b.earnings;
    }
  };
  return posts.toSorted((a, b) => (sort.direction === "ascending" ? 1 : -1) * compare(a, b));
}

/** A count summed across posts; a post X hasn't reported on yet adds nothing. */
export function engagementTotal(
  posts: readonly Partial<Record<EngagementMetric, number>>[],
  metric: EngagementMetric,
): number {
  return posts.reduce((total, post) => total + (post[metric] ?? 0), 0);
}

const COUNT = new Intl.NumberFormat("en-US");
const COMPACT_COUNT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** e.g. "198,942". */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** e.g. "200K", for chart axes. */
export function formatCompactCount(value: number): string {
  return COMPACT_COUNT.format(value);
}
