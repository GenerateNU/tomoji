import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import { getXPostMetrics, readXMetricsConfig, type XMissingPost } from "./lib/xApi";
import { saveSyncedCounts, syncedCounts } from "./models/posts";

// X's limit for one post lookup.
const PAGE_SIZE = 100;

/**
 * Daily analytics sync: refreshes views and engagement for one page of posts in
 * the sync window, then schedules the next page with the same cutoff. Payouts
 * don't use these counts. Does nothing unless `X_METRICS_SYNC_ENABLED` is "true".
 * An X failure stops the run; tomorrow's run reads the same posts again.
 */
export const sync = internalAction({
  args: {
    now: v.optional(v.number()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = readXMetricsConfig(env);
    if (!config.enabled) return null;
    const now = args.now ?? Date.now();
    const pageSize = args.pageSize ?? PAGE_SIZE;
    const page = await ctx.runQuery(internal.posts.listEarning, {
      now,
      paginationOpts: { numItems: pageSize, cursor: args.cursor ?? null },
    });
    if (page.page.length > 0) {
      let result;
      try {
        result = await getXPostMetrics(
          config.bearerToken,
          page.page.map((post) => post.xPostId),
        );
      } catch (error) {
        // Expected X failures carry redacted data; anything else is a bug.
        if (!(error instanceof ConvexError)) throw error;
        console.warn("X metrics sync stopped", error.data);
        return null;
      }
      const postIds = new Map(page.page.map((post) => [post.xPostId, post.postId]));
      if (result.found.length > 0) {
        await ctx.runMutation(internal.xMetrics.saveCounts, {
          counts: result.found.map(({ xPostId, views, engagement }) => ({
            postId: postIds.get(xPostId)!,
            views,
            engagement,
          })),
        });
      }
      if (result.missing.length > 0) {
        console.warn("X metrics sync: posts without counts", countReasons(result.missing));
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.xMetrics.sync, {
        now,
        pageSize,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/** Stores one page of synced counts, skipping posts replaced since they were listed. */
export const saveCounts = internalMutation({
  args: { counts: v.array(syncedCounts) },
  returns: v.number(),
  handler: async (ctx, { counts }) => await saveSyncedCounts(ctx, counts),
});

/** How many posts were left out for each reason, for the log. */
function countReasons(missing: XMissingPost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { reason } of missing) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}
