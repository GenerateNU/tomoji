import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { getXPostMetrics, readXMetricsConfig, type XMissingPost } from "./lib/xApi";
import {
  CUTOFF_READ_WINDOW_MS,
  earningPost,
  listCollectionTargets,
  saveSyncedCounts,
  syncedCounts,
  syncedCountsResult,
  type EarningPost,
} from "./models/posts";

// X's limit for one post lookup.
const PAGE_SIZE = 100;

/**
 * Daily analytics sync: refreshes views and engagement for one page of posts in
 * the sync window, then schedules the next page with the same cutoff. Does
 * nothing unless `X_METRICS_SYNC_ENABLED` is "true". A page that fails is skipped
 * so it can't block later pages; only a rate limit stops the run, and tomorrow's
 * run reads the same posts again.
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
      // X's rate limit covers every page, so wait for tomorrow's run.
      if ((await syncPage(ctx, config.bearerToken, page.page)) === "rateLimited") return null;
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

/**
 * Reads the given posts now. Scheduled on a post's first verification, so
 * earnings have a reading close to the start of the window.
 */
export const collect = internalAction({
  args: { postIds: v.array(v.id("posts")) },
  returns: v.null(),
  handler: async (ctx, { postIds }): Promise<null> => {
    const config = readXMetricsConfig(env);
    if (!config.enabled) return null;
    const posts = await ctx.runQuery(internal.xMetrics.collectionTargets, { postIds });
    if (posts.length > 0) await syncPage(ctx, config.bearerToken, posts);
    return null;
  },
});

/**
 * Reads a post just before its earnings cutoff. Settlement uses the latest reading
 * in the 5 minutes before the cutoff, so if one already exists this is the unneeded
 * retry and does nothing. Nothing runs once the cutoff has passed.
 */
export const collectForCutoff = internalAction({
  args: { postId: v.id("posts"), cutoffAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { postId, cutoffAt }): Promise<null> => {
    const config = readXMetricsConfig(env);
    if (!config.enabled || Date.now() >= cutoffAt) return null;
    const posts = await ctx.runQuery(internal.xMetrics.collectionTargets, {
      postIds: [postId],
      readSince: cutoffAt - CUTOFF_READ_WINDOW_MS,
    });
    if (posts.length > 0) await syncPage(ctx, config.bearerToken, posts);
    return null;
  },
});

/** Which of these posts the collector should read now (see `listCollectionTargets`). */
export const collectionTargets = internalQuery({
  args: { postIds: v.array(v.id("posts")), readSince: v.optional(v.number()) },
  returns: v.array(earningPost),
  handler: async (ctx, { postIds, readSince }) =>
    await listCollectionTargets(ctx, postIds, readSince),
});

/**
 * Looks up and stores one page. Expected failures, from X or from saving, are
 * logged and the page is skipped; anything else is a bug and is rethrown.
 */
async function syncPage(
  ctx: ActionCtx,
  bearerToken: string,
  posts: EarningPost[],
): Promise<"synced" | "skipped" | "rateLimited"> {
  let result;
  try {
    result = await getXPostMetrics(
      bearerToken,
      posts.map((post) => post.xPostId),
    );
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error;
    if ((error.data as { reason?: unknown }).reason === "x_rate_limited") {
      console.warn("X metrics sync stopped: rate limited", error.data);
      return "rateLimited";
    }
    console.warn("X metrics sync: page skipped", error.data);
    return "skipped";
  }
  if (result.missing.length > 0) {
    console.warn("X metrics sync: posts without counts", countReasons(result.missing));
  }
  if (result.found.length === 0) return "synced";
  const postIds = new Map(posts.map((post) => [post.xPostId, post.postId]));
  let saved;
  try {
    saved = await ctx.runMutation(internal.xMetrics.saveCounts, {
      counts: result.found.map(({ xPostId, views, engagement }) => ({
        postId: postIds.get(xPostId)!,
        views,
        engagement,
      })),
    });
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error;
    console.warn("X metrics sync: page skipped, counts not saved", error.data);
    return "skipped";
  }
  if (saved.skipped.length > 0) {
    console.warn("X metrics sync: posts not saved", saved.skipped);
  }
  return "synced";
}

/** Stores one page of synced counts, skipping posts replaced since they were listed. */
export const saveCounts = internalMutation({
  args: { counts: v.array(syncedCounts) },
  returns: syncedCountsResult,
  handler: async (ctx, { counts }) => await saveSyncedCounts(ctx, counts),
});

/** How many posts were left out for each reason, for the log. */
function countReasons(missing: XMissingPost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { reason } of missing) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}
