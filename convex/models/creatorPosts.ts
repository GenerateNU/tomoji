import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requirePost } from "./posts";

// Posts aren't indexed by creator, so the Posts page reaches them through the
// creator's assignments. These caps keep one read inside a query's limits; past
// any of them the creator sees their most recent posts and `isPartial` is set.
const MAX_ASSIGNMENTS = 50;
const MAX_SUBMISSIONS_PER_ASSIGNMENT = 100;
const MAX_PAYOUTS = 2_000;
const MAX_POST_PAYOUTS = 500;
const MAX_SNAPSHOTS = 4_000;

// `termsPending` assignments can't have posts yet.
const POSTING_STATUSES = ["active", "completed", "cancelled"] as const;

/** One of the creator's active posts, with its brief and what it has earned. */
export const creatorPost = v.object({
  postId: v.id("posts"),
  assignmentId: v.id("assignments"),
  url: v.string(),
  isVerified: v.boolean(),
  // When it went live on X, or when the link was saved if it isn't verified yet.
  postedAt: v.number(),
  // The approved draft's caption and video.
  caption: v.optional(v.string()),
  mediaId: v.optional(v.id("mediaUploads")),
  // The deliverable the post fulfils, which names it.
  title: v.string(),
  opportunityTitle: v.string(),
  // Empty when the company row is gone.
  companyName: v.string(),
  companyLogoMediaId: v.optional(v.id("mediaUploads")),
  // Current totals from X. Only views keep a history (`viewHistory`).
  views: v.optional(v.number()),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  reposts: v.optional(v.number()),
  quotes: v.optional(v.number()),
  // Cents earned so far, from finalized payouts.
  earnings: v.number(),
});
export type CreatorPost = Infer<typeof creatorPost>;

export const creatorPostList = v.object({
  // Newest first.
  posts: v.array(creatorPost),
  // The latest time X counts were read for any of these posts.
  metricsUpdatedAt: v.union(v.number(), v.null()),
  isPartial: v.boolean(),
});
export type CreatorPostList = Infer<typeof creatorPostList>;

export const creatorPostDetail = creatorPost.extend({
  // The assignment's agreed terms, in cents; CPM is per 1,000 eligible views.
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  // Each finalized payout, oldest first.
  earningsHistory: v.array(v.object({ at: v.number(), amount: v.number() })),
  isPartial: v.boolean(),
});
export type CreatorPostDetail = Infer<typeof creatorPostDetail>;

export const viewHistoryArgs = v.object({
  // Start time in the caller's timezone; null is all time.
  from: v.union(v.number(), v.null()),
  // One post instead of all of the caller's.
  postId: v.optional(v.id("posts")),
});

export const viewHistory = v.object({
  total: v.number(),
  // Each observed increase in a post's views, oldest first. A count that fell
  // gives a negative amount, so the running total always matches X.
  views: v.array(v.object({ at: v.number(), amount: v.number() })),
  isPartial: v.boolean(),
});
export type ViewHistory = Infer<typeof viewHistory>;

type ActivePost = {
  post: Doc<"posts">;
  submission: Doc<"submissions">;
  assignment: Doc<"assignments">;
};

/**
 * The creator's active posts, newest first, with their brief, company and
 * earnings. Reads the 50 most recent assignments in each posting status.
 */
export async function listCreatorPosts(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
): Promise<CreatorPostList> {
  const { posts, isPartial } = await listActivePosts(ctx, creatorId);
  const {
    byDeliverable,
    byPost,
    isPartial: payoutsPartial,
  } = await creatorEarnings(ctx, creatorId);
  const rows = await Promise.all(
    posts.map(async (active) => ({
      ...(await toCreatorPost(ctx, active)),
      earnings:
        (byDeliverable.get(
          deliverableKey(active.assignment._id, active.submission.deliverableId),
        ) ?? 0) + (byPost.get(active.post._id) ?? 0),
    })),
  );
  rows.sort((a, b) => b.postedAt - a.postedAt);
  const updates = posts.flatMap(({ post }) =>
    post.viewsUpdatedAt === undefined ? [] : [post.viewsUpdatedAt],
  );
  return {
    posts: rows,
    metricsUpdatedAt: updates.length === 0 ? null : Math.max(...updates),
    isPartial: isPartial || payoutsPartial,
  };
}

/**
 * One of the caller's posts, with the assignment's terms and its payouts.
 *
 * @throws `not_found` if the post doesn't exist, was replaced, or isn't the creator's.
 */
export async function getCreatorPost(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
): Promise<CreatorPostDetail> {
  const active = await requireCreatorPost(ctx, creatorId, postId);
  const { assignment, submission, post } = active;
  const rows = await ctx.db
    .query("payouts")
    .withIndex("by_assignmentId_and_reviewRequestedAt", (q) => q.eq("assignmentId", assignment._id))
    .order("desc")
    .take(MAX_POST_PAYOUTS + 1);
  const payouts = rows
    .slice(0, MAX_POST_PAYOUTS)
    .filter((payout) => earnsFor(payout, submission.deliverableId, post._id))
    .reverse();
  const earningsHistory = payouts.map((payout) => ({
    at: payout.reviewRequestedAt,
    amount: payout.amount,
  }));
  return {
    ...(await toCreatorPost(ctx, active)),
    earnings: earningsHistory.reduce((total, { amount }) => total + amount, 0),
    fixedFeeCents: assignment.fixedFeeCents,
    cpmRateCents: assignment.cpmRateCents,
    paymentCapCents: assignment.paymentCapCents,
    earningsHistory,
    isPartial: rows.length > MAX_POST_PAYOUTS,
  };
}

/**
 * How the caller's views grew since `from`, across all their posts or one.
 * Each post's first increase is measured from its last count before `from`,
 * or from zero when there is none.
 *
 * @throws `not_found` if `postId` doesn't exist or isn't the creator's.
 */
export async function getViewHistory(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  { from, postId }: Infer<typeof viewHistoryArgs>,
): Promise<ViewHistory> {
  const { postIds, isPartial: postsPartial } =
    postId === undefined
      ? await listActivePosts(ctx, creatorId).then(({ posts, isPartial }) => ({
          postIds: posts.map(({ post }) => post._id),
          isPartial,
        }))
      : {
          postIds: [(await requireCreatorPost(ctx, creatorId, postId)).post._id],
          isPartial: false,
        };

  let budget = MAX_SNAPSHOTS;
  let isPartial = postsPartial;
  const views: { at: number; amount: number }[] = [];
  for (const id of postIds) {
    if (budget <= 0) {
      isPartial = true;
      break;
    }
    const baseline =
      from === null
        ? null
        : await ctx.db
            .query("postViewSnapshots")
            .withIndex("by_postId_and_observedAt", (q) => q.eq("postId", id).lt("observedAt", from))
            .order("desc")
            .first();
    const snapshots = await ctx.db
      .query("postViewSnapshots")
      .withIndex("by_postId_and_observedAt", (q) =>
        from === null ? q.eq("postId", id) : q.eq("postId", id).gte("observedAt", from),
      )
      .take(budget + 1);
    if (snapshots.length > budget) isPartial = true;
    let previous = baseline?.views ?? 0;
    for (const snapshot of snapshots.slice(0, budget)) {
      views.push({ at: snapshot.observedAt, amount: snapshot.views - previous });
      previous = snapshot.views;
    }
    budget -= snapshots.length;
  }

  views.sort((a, b) => a.at - b.at);
  return {
    total: views.reduce((total, { amount }) => total + amount, 0),
    views: views.filter(({ amount }) => amount !== 0),
    isPartial,
  };
}

/** The post, if it is active and on one of the creator's assignments. */
async function requireCreatorPost(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
): Promise<ActivePost> {
  // Throws `not_found` for a missing post or one on someone else's assignment.
  const post = await requirePost(ctx, { role: "creator", creatorId }, postId);
  // A replaced post's earnings belong to the post that replaced it.
  if (!post.isActive) throw apiError("not_found", { resource: "post" });
  const submission = await ctx.db.get("submissions", post.submissionId);
  const assignment = submission && (await ctx.db.get("assignments", submission.assignmentId));
  if (!submission || !assignment) throw new Error("post access returned an orphaned post");
  return { post, submission, assignment };
}

/** Active posts on approved drafts across the creator's recent assignments. */
async function listActivePosts(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
): Promise<{ posts: ActivePost[]; isPartial: boolean }> {
  let isPartial = false;
  const assignments: Doc<"assignments">[] = [];
  for (const status of POSTING_STATUSES) {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_creatorId_and_status", (q) =>
        q.eq("creatorId", creatorId).eq("status", status),
      )
      .order("desc")
      .take(MAX_ASSIGNMENTS + 1);
    if (rows.length > MAX_ASSIGNMENTS) isPartial = true;
    assignments.push(...rows.slice(0, MAX_ASSIGNMENTS));
  }

  const posts: ActivePost[] = [];
  for (const assignment of assignments) {
    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_assignmentId_and_deliverableId", (q) => q.eq("assignmentId", assignment._id))
      .take(MAX_SUBMISSIONS_PER_ASSIGNMENT + 1);
    if (submissions.length > MAX_SUBMISSIONS_PER_ASSIGNMENT) isPartial = true;
    for (const submission of submissions.slice(0, MAX_SUBMISSIONS_PER_ASSIGNMENT)) {
      // Posts are only created on approved drafts.
      if (submission.status !== "approved") continue;
      const post = await ctx.db
        .query("posts")
        .withIndex("by_submissionId_and_isActive", (q) =>
          q.eq("submissionId", submission._id).eq("isActive", true),
        )
        .first();
      if (post !== null) posts.push({ post, submission, assignment });
    }
  }
  return { posts, isPartial };
}

/**
 * Earnings follow the deliverable, so a replacement post keeps what the one it
 * replaced earned. A payout without a stored deliverable counts for its post.
 */
function earnsFor(
  payout: Doc<"payouts">,
  deliverableId: Id<"deliverables">,
  postId: Id<"posts">,
): boolean {
  return payout.deliverableId === undefined
    ? payout.postId === postId
    : payout.deliverableId === deliverableId;
}

function deliverableKey(assignmentId: Id<"assignments">, deliverableId: Id<"deliverables">) {
  return `${assignmentId}:${deliverableId}`;
}

/** The creator's payout totals by deliverable, and by post for payouts without one. */
async function creatorEarnings(ctx: QueryCtx, creatorId: Id<"creators">) {
  const rows = await ctx.db
    .query("payouts")
    .withIndex("by_creatorId_and_reviewRequestedAt", (q) => q.eq("creatorId", creatorId))
    .order("desc")
    .take(MAX_PAYOUTS + 1);
  const byDeliverable = new Map<string, number>();
  const byPost = new Map<Id<"posts">, number>();
  for (const payout of rows.slice(0, MAX_PAYOUTS)) {
    if (payout.deliverableId === undefined) {
      byPost.set(payout.postId, (byPost.get(payout.postId) ?? 0) + payout.amount);
    } else {
      const key = deliverableKey(payout.assignmentId, payout.deliverableId);
      byDeliverable.set(key, (byDeliverable.get(key) ?? 0) + payout.amount);
    }
  }
  return { byDeliverable, byPost, isPartial: rows.length > MAX_PAYOUTS };
}

/** The post's public fields with its brief; `earnings` is filled in by the caller. */
async function toCreatorPost(
  ctx: QueryCtx,
  { post, submission, assignment }: ActivePost,
): Promise<CreatorPost> {
  const [deliverable, opportunity, company] = await Promise.all([
    ctx.db.get("deliverables", submission.deliverableId),
    ctx.db.get("opportunities", assignment.opportunityId),
    ctx.db.get("companies", assignment.companyId),
  ]);
  const result: CreatorPost = {
    postId: post._id,
    assignmentId: assignment._id,
    url: post.url,
    isVerified: post.isVerified,
    postedAt: post.postedAt ?? post._creationTime,
    title: deliverable?.title ?? opportunity?.title ?? "",
    opportunityTitle: opportunity?.title ?? "",
    companyName: company?.name ?? "",
    earnings: 0,
  };
  if (submission.caption !== undefined) result.caption = submission.caption;
  if (submission.mediaId !== undefined) result.mediaId = submission.mediaId;
  if (company?.profilePictureMediaId !== undefined) {
    result.companyLogoMediaId = company.profilePictureMediaId;
  }
  for (const key of ["views", "likes", "comments", "reposts", "quotes"] as const) {
    if (post[key] !== undefined) result[key] = post[key];
  }
  return result;
}
