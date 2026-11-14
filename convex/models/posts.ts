import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { EARNING_WINDOW_MS } from "../lib/earningsCalculator";
import { DAY_MS } from "../lib/time";
import { requireAssignment, type AssignmentViewer } from "./assignments";
import { listOpportunityDeliverables } from "./deliverableDrafts";
import { getLatestSubmission } from "./submissions";
import { getXAccountByCreatorId } from "./xAccountLookup";
import { postCaptionCheck } from "../schemas/posts.schema";
import { normalizeCaption, type getXPostForCaptionCheck } from "../lib/xApi";
import { holdPostEarnings, initializePostEarnings, recordPostViewSnapshot } from "./earningSources";
import schema from "../schema";

/** Client-facing post fields; earnings evidence and lookup reservations stay internal. */
export const postView = schema
  .doc("posts")
  .pick(
    "_id",
    "_creationTime",
    "submissionId",
    "campaignId",
    "url",
    "xPostId",
    "isActive",
    "isVerified",
    "postedAt",
    "firstVerifiedAt",
    "removedAt",
    "captionCheck",
    "views",
    "viewsUpdatedAt",
    "likes",
    "comments",
    "reposts",
    "quotes",
  );
export type PostView = Infer<typeof postView>;

export function toPostView(post: Doc<"posts">): PostView {
  const result: PostView = {
    _id: post._id,
    _creationTime: post._creationTime,
    submissionId: post.submissionId,
    campaignId: post.campaignId,
    url: post.url,
    xPostId: post.xPostId,
    isActive: post.isActive,
    isVerified: post.isVerified,
  };
  for (const key of [
    "postedAt",
    "firstVerifiedAt",
    "removedAt",
    "captionCheck",
    "views",
    "viewsUpdatedAt",
    "likes",
    "comments",
    "reposts",
    "quotes",
  ] as const) {
    if (post[key] !== undefined) Object.assign(result, { [key]: post[key] });
  }
  return result;
}

/** The creator-supplied fields of a new post. */
export const postCreate = v.object({
  submissionId: v.id("submissions"),
  url: v.string(),
});
export type PostCreate = Infer<typeof postCreate>;

/** Who is reading or acting on posts. Access follows the assignment's. */
export type PostViewer = AssignmentViewer;

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

// `<handle>/status/<id>`, `i/status/<id>`, or `i/web/status/<id>`, with any
// trailing parts like `/photo/1`. A handle is 1-15 letters, digits, or
// underscores. Post ids are numeric, which tells a post apart from other pages.
const X_POST_PATH = /^\/(?:i(?:\/web)?|([A-Za-z0-9_]{1,15}))\/status\/([1-9]\d{0,18})(?:\/.*)?$/;

/**
 * Reads an X post link into its id and canonical URL:
 * `https://x.com/<handle>/status/<id>`, or `https://x.com/i/status/<id>` when
 * the link has no handle. The handle is lowercased because X handles aren't
 * case-sensitive.
 *
 * @throws `invalid_state` with `url_invalid` if it isn't a link to an X post.
 */
function requirePostUrl(value: string): { url: string; xPostId: string } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw apiError("invalid_state", { reason: "url_invalid" });
  }
  const match = X_POST_PATH.exec(url.pathname);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !X_HOSTS.has(url.hostname) ||
    !match
  ) {
    throw apiError("invalid_state", { reason: "url_invalid" });
  }
  const [, handle, xPostId] = match;
  return { url: `https://x.com/${handle?.toLowerCase() ?? "i"}/status/${xPostId}`, xPostId };
}

/**
 * Checks that no other submission has used this X post, active or replaced, so
 * one post can't count twice. A submission may reuse its own earlier link. The
 * index is not unique, so check here; every post with this id belongs to one
 * submission, so the first is enough.
 *
 * @throws `conflict` with `post_already_used` if another submission used it.
 */
async function requirePostUnused(
  ctx: MutationCtx,
  xPostId: string,
  submissionId: Id<"submissions">,
): Promise<void> {
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_xPostId", (q) => q.eq("xPostId", xPostId))
    .first();
  if (existing !== null && existing.submissionId !== submissionId) {
    throw apiError("conflict", { reason: "post_already_used" });
  }
}

/**
 * @throws `invalid_state` with `post_inactive` if the post was replaced. Only a
 * submission's active post can change.
 */
function requireActive(post: Doc<"posts">): void {
  if (!post.isActive) {
    throw apiError("invalid_state", { reason: "post_inactive" });
  }
}

/**
 * Records the live X post for the creator's approved submission. The post
 * starts unverified; `postedAt` is set when an operator verifies it.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the submission isn't approved, the assignment
 * isn't active, or the URL isn't an X post link.
 * @throws `conflict` if the submission already has an active post, or another
 * submission used the same X post.
 */
export async function createPost(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  fields: PostCreate,
): Promise<Id<"posts">> {
  const submission = await ctx.db.get("submissions", fields.submissionId);
  if (submission === null) throw apiError("not_found", { resource: "submission" });
  const assignment = await requireAssignment(
    ctx,
    { role: "creator", creatorId },
    submission.assignmentId,
  );
  if (submission.status !== "approved") {
    throw apiError("invalid_state", { reason: "submission_not_approved" });
  }
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  const { url, xPostId } = requirePostUrl(fields.url);
  // One active post per submission, and so per deliverable, since each
  // deliverable has at most one approved submission. The index is not unique,
  // so check here.
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_submissionId_and_isActive", (q) =>
      q.eq("submissionId", submission._id).eq("isActive", true),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_posted" });
  }
  await requirePostUnused(ctx, xPostId, submission._id);

  return await ctx.db.insert("posts", {
    submissionId: submission._id,
    campaignId: assignment.campaignId,
    url,
    xPostId,
    isActive: true,
    isVerified: false,
    earningsTrackingVersion: 1,
  });
}

/**
 * Returns a post the viewer may see: creators see their own, company users see
 * their company's, and operators see all. Replaced posts are returned too, so
 * disputes can still see the old link.
 *
 * @throws `not_found` if the post doesn't exist or the viewer may not see it.
 */
export async function requirePost(
  ctx: QueryCtx | MutationCtx,
  viewer: PostViewer,
  postId: Id<"posts">,
): Promise<Doc<"posts">> {
  return (await requirePostAccess(ctx, viewer, postId)).post;
}

/** The post and its assignment, if the viewer may see the assignment. */
async function requirePostAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: PostViewer,
  postId: Id<"posts">,
): Promise<{ post: Doc<"posts">; assignment: Doc<"assignments"> }> {
  const post = await ctx.db.get("posts", postId);
  const submission = post && (await ctx.db.get("submissions", post.submissionId));
  if (!post || !submission) throw apiError("not_found", { resource: "post" });
  // Throws `not_found` when the viewer can't see the post's assignment.
  const assignment = await requireAssignment(ctx, viewer, submission.assignmentId);
  return { post, assignment };
}

/**
 * The post, for an operator changing its verification. Verification can only
 * change while the assignment is active, since payouts are settled from it;
 * later fixes go through disputes.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the post was replaced (`post_inactive`) or the
 * assignment ended (`assignment_not_active`).
 */
async function requireOperatorEditablePost(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<Doc<"posts">> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "operator" }, postId);
  requireActive(post);
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  return post;
}

/** The new link for a creator's post. */
export const postReplacement = v.object({ url: v.string() });
export type PostReplacement = Infer<typeof postReplacement>;

/**
 * Replaces the creator's unverified post with a new one for a new link. The
 * old post stays as an inactive record for disputes; the new one starts
 * unverified, without `postedAt` or metrics, which belonged to the old link.
 *
 * @throws `not_found` if the post doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the post was already replaced or is verified, the
 * assignment isn't active, or the URL isn't an X post link.
 * @throws `conflict` if another submission used the same X post.
 * @returns the new post.
 */
export async function replacePost(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
  fields: PostReplacement,
): Promise<Doc<"posts">> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "creator", creatorId }, postId);
  requireActive(post);
  if (post.isVerified) {
    throw apiError("invalid_state", { reason: "post_verified" });
  }
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  const { url, xPostId } = requirePostUrl(fields.url);
  if (xPostId === post.xPostId) return post;
  await requirePostUnused(ctx, xPostId, post.submissionId);
  // This post may have been verified before it became replaceable again.
  // Hold any existing agreement; the helper is a no-op when none exists.
  await holdPostEarnings(ctx, postId, "post_replaced");
  await ctx.db.patch("posts", postId, { isActive: false });
  const newPostId = await ctx.db.insert("posts", {
    submissionId: post.submissionId,
    campaignId: post.campaignId,
    url,
    xPostId,
    isActive: true,
    isVerified: false,
    ...(post.earningsTrackingVersion === undefined
      ? {}
      : { earningsTrackingVersion: post.earningsTrackingVersion }),
    ...(post.firstVerifiedAt === undefined ? {} : { firstVerifiedAt: post.firstVerifiedAt }),
    ...(post.earningsTimingUnknown ? { earningsTimingUnknown: true } : {}),
  });
  return (await ctx.db.get("posts", newPostId))!;
}

/** What the operator reads off the post on X when verifying it. */
export const postVerification = v.object({
  postedAt: v.number(), // Unix milliseconds.
});
export type PostVerification = Infer<typeof postVerification>;

/**
 * Marks an unverified post verified and records when it went live on X.
 * Operators do this by hand for now; automatic verification through the X API
 * is a separate ticket.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the assignment isn't active, the post is already
 * verified, or `postedAt` isn't a past Unix time in whole milliseconds.
 */
export async function verifyPost(
  ctx: MutationCtx,
  postId: Id<"posts">,
  { postedAt }: PostVerification,
): Promise<Doc<"posts">> {
  const post = await requireOperatorEditablePost(ctx, postId);
  if (post.isVerified) {
    throw apiError("invalid_state", { reason: "post_already_verified" });
  }
  if (post.removedAt !== undefined) {
    throw apiError("invalid_state", { reason: "post_removed" });
  }
  if (!Number.isSafeInteger(postedAt) || postedAt < 0 || postedAt > Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_posted_at" });
  }
  const earnings = await initializePostEarnings(ctx, postId, Date.now());
  const firstVerifiedAt = post.firstVerifiedAt ?? earnings?.startedAt;
  const patch = {
    isVerified: true,
    postedAt,
    ...(firstVerifiedAt === undefined ? { earningsTimingUnknown: true } : { firstVerifiedAt }),
  };
  await ctx.db.patch("posts", postId, patch);
  return { ...post, ...patch };
}

/**
 * Marks a verified post unverified, for example when an operator finds it
 * doesn't match the approved submission. `postedAt` is cleared with it, since
 * it was entered on verification. The creator can then fix the link.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the assignment isn't active or the post isn't verified.
 */
export async function unverifyPost(ctx: MutationCtx, postId: Id<"posts">): Promise<Doc<"posts">> {
  const post = await requireOperatorEditablePost(ctx, postId);
  if (!post.isVerified) {
    throw apiError("invalid_state", { reason: "post_not_verified" });
  }
  await holdPostEarnings(ctx, postId, "verification_changed");
  await ctx.db.patch("posts", postId, {
    isVerified: false,
    postedAt: undefined,
    captionCheck: "manualReview",
    captionCheckStartedAt: undefined,
  });
  // Read it back so the cleared field is absent rather than `undefined`.
  return (await ctx.db.get("posts", postId))!;
}

/** Throws unless `count` is a nonnegative whole number. */
function requireCount(count: number, reason: string, field?: string) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw apiError("invalid_state", { reason, ...(field === undefined ? {} : { field }) });
  }
}

/**
 * Stores the post's current view count and when it was fetched. Views are what
 * payouts use, so only server code calls this and creators can't inflate them.
 * Works for any active post, including after its assignment ends.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the post was replaced, or with `invalid_views` if
 * the count isn't a nonnegative whole number.
 */
export async function updatePostViews(
  ctx: MutationCtx,
  postId: Id<"posts">,
  views: number,
): Promise<Doc<"posts">> {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  requireActive(post);
  requireCount(views, "invalid_views");
  const patch = { views, viewsUpdatedAt: Date.now() };
  await recordPostViewSnapshot(ctx, {
    postId,
    observedAt: patch.viewsUpdatedAt,
    views,
    sourceKey: `metrics:${patch.viewsUpdatedAt}`,
  });
  await ctx.db.patch("posts", postId, patch);
  return { ...post, ...patch };
}

/** Engagement counts from X. Any can be left out; a left-out count keeps its stored value. */
export const postEngagement = v.object({
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  reposts: v.optional(v.number()),
  quotes: v.optional(v.number()),
});
export type PostEngagement = Infer<typeof postEngagement>;

/**
 * Stores whichever engagement counts are given, for analytics. Kept apart from
 * `updatePostViews` so these counts never hold back or change what payouts use.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the post was replaced, or with `invalid_engagement`
 * and the `field` if a given count isn't a nonnegative whole number.
 */
export async function updatePostEngagement(
  ctx: MutationCtx,
  postId: Id<"posts">,
  engagement: PostEngagement,
): Promise<Doc<"posts">> {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  requireActive(post);
  const patch: PostEngagement = {};
  for (const field of ["likes", "comments", "reposts", "quotes"] as const) {
    const count = engagement[field];
    if (count === undefined) continue;
    requireCount(count, "invalid_engagement", field);
    patch[field] = count;
  }
  await ctx.db.patch("posts", postId, patch);
  return { ...post, ...patch };
}

/**
 * The assignment's active posts, newest first: one per deliverable with an
 * approved submission. Approval is final, so a deliverable's approved
 * submission is its latest. An opportunity has at most `MAX_DELIVERABLES`, so
 * this is bounded and returned as a single page.
 */
async function listAssignmentPosts(
  ctx: QueryCtx,
  assignment: Doc<"assignments">,
): Promise<Doc<"posts">[]> {
  const posts: Doc<"posts">[] = [];
  for (const deliverable of await listOpportunityDeliverables(ctx, assignment.opportunityId)) {
    const submission = await getLatestSubmission(ctx, assignment._id, deliverable._id);
    if (submission?.status !== "approved") continue;
    const post = await ctx.db
      .query("posts")
      .withIndex("by_submissionId_and_isActive", (q) =>
        q.eq("submissionId", submission._id).eq("isActive", true),
      )
      .first();
    if (post !== null) posts.push(post);
  }
  return posts.sort((a, b) => b._creationTime - a._creationTime);
}

/** `list` takes exactly one of `assignmentId` or `campaignId`. */
export const postListFilters = v.object({
  assignmentId: v.optional(v.id("assignments")),
  campaignId: v.optional(v.id("campaigns")),
  paginationOpts: paginationOptsValidator,
});

/**
 * Returns one page of active posts, newest first, for either an assignment or
 * a campaign. An assignment has at most one active post per deliverable, all
 * returned in one page; replaced posts are only reachable by id. Campaign listing is for the
 * owning company and operators; creators only see their own posts.
 *
 * @throws `invalid_state` with `invalid_filter` unless exactly one filter is given.
 * @throws `not_found` if the assignment or campaign isn't visible to the viewer.
 * @throws `forbidden` if a creator lists by campaign.
 */
export async function listPosts(
  ctx: QueryCtx,
  viewer: PostViewer,
  options: Infer<typeof postListFilters>,
): Promise<PaginationResult<Doc<"posts">>> {
  const { assignmentId, campaignId, paginationOpts } = options;
  if ((assignmentId === undefined) === (campaignId === undefined)) {
    throw apiError("invalid_state", { reason: "invalid_filter" });
  }

  if (assignmentId !== undefined) {
    const assignment = await requireAssignment(ctx, viewer, assignmentId);
    return { page: await listAssignmentPosts(ctx, assignment), isDone: true, continueCursor: "" };
  }

  if (viewer.role === "creator") {
    throw apiError("forbidden", { reason: "creators_list_by_assignment" });
  }
  const campaign = await ctx.db.get("campaigns", campaignId!);
  if (campaign === null || (viewer.role === "company" && campaign.companyId !== viewer.companyId)) {
    throw apiError("not_found", { resource: "campaign" });
  }
  return await ctx.db
    .query("posts")
    .withIndex("by_campaignId_and_isActive", (q) =>
      q.eq("campaignId", campaign._id).eq("isActive", true),
    )
    .order("desc")
    .paginate(paginationOpts);
}

/** Reads the approved caption for the current linked post before a paid X lookup. */
export async function getPostCaptionInput(ctx: QueryCtx, postId: Id<"posts">) {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  requireActive(post);
  const submission = await ctx.db.get("submissions", post.submissionId);
  if (submission?.status !== "approved")
    throw apiError("invalid_state", { reason: "submission_not_approved" });
  return { xPostId: post.xPostId, caption: submission.caption };
}

const captionCheckRetryMs = 30_000;

export const creatorCaptionCheck = v.union(
  v.literal("alreadyChecked"),
  v.literal("inProgress"),
  postCaptionCheck,
);

export const captionCheckReservation = v.union(
  v.object({ status: creatorCaptionCheck }),
  v.object({
    status: v.literal("lookup"),
    xPostId: v.string(),
    startedAt: v.number(),
  }),
);

/** Authorizes and reserves an X read; drafts with no caption go straight to manual review. */
export async function startCreatorCaptionCheck(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
): Promise<Infer<typeof captionCheckReservation>> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "creator", creatorId }, postId);
  requireActive(post);
  if (assignment.status !== "active")
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  if (post.isVerified || post.captionCheck === "match" || post.captionCheck === "manualReview")
    return { status: "alreadyChecked" };
  const submission = await ctx.db.get("submissions", post.submissionId);
  if (submission?.status !== "approved")
    throw apiError("invalid_state", { reason: "submission_not_approved" });
  const account = submission.caption ? await getXAccountByCreatorId(ctx, creatorId) : null;
  if (!submission.caption || account?.status !== "connected") {
    await ctx.db.patch("posts", postId, { captionCheck: "manualReview" });
    return { status: "manualReview" };
  }
  const startedAt = Date.now();
  if (
    post.captionCheckStartedAt !== undefined &&
    startedAt - post.captionCheckStartedAt < captionCheckRetryMs
  ) {
    return { status: "inProgress" };
  }
  await ctx.db.patch("posts", postId, { captionCheckStartedAt: startedAt });
  return { status: "lookup", xPostId: post.xPostId, startedAt };
}

/** Rechecks ownership and the active link before applying a result from X. */
export async function finishCreatorCaptionCheck(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
  startedAt: number,
  published: Awaited<ReturnType<typeof getXPostForCaptionCheck>>,
): Promise<Infer<typeof creatorCaptionCheck>> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "creator", creatorId }, postId);
  requireActive(post);
  if (assignment.status !== "active")
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  if (post.isVerified || post.captionCheck === "match" || post.captionCheck === "manualReview")
    return "alreadyChecked";
  if (post.captionCheckStartedAt !== startedAt) return "inProgress";
  const submission = await ctx.db.get("submissions", post.submissionId);
  if (submission?.status !== "approved" || !submission.caption)
    throw apiError("invalid_state", { reason: "submission_not_approved" });
  const account = await getXAccountByCreatorId(ctx, creatorId);
  const sameAuthor = account?.status === "connected" && account.xUserId === published.authorId;
  const status =
    sameAuthor && normalizeCaption(submission.caption) === normalizeCaption(published.text)
      ? "match"
      : "mismatch";

  // A caption match cannot verify a video's content. Extra media and reposts also need review.
  if (
    status === "match" &&
    !submission.mediaId &&
    !published.hasExtraContent &&
    published.postedAt >= Math.floor(submission._creationTime / 1000) * 1000
  ) {
    await verifyPost(ctx, postId, { postedAt: published.postedAt });
  }
  await ctx.db.patch("posts", postId, { captionCheck: status });
  return status;
}

// The earnings window, measured from first verification, plus one day: the sync
// runs daily at 00:00 UTC, so the first run after the window ends is at most a day
// later, and the margin keeps the post in that run to store its final total.
const SYNC_MARGIN_DAYS = 1;
const SYNC_WINDOW_MS = EARNING_WINDOW_MS + SYNC_MARGIN_DAYS * DAY_MS;

/** What the daily X sync needs to fetch a post's counts and store them. */
export const earningPost = v.object({ postId: v.id("posts"), xPostId: v.string() });
export type EarningPost = Infer<typeof earningPost>;

/**
 * One page of posts the daily X sync fetches at `now`: verified, active, first verified
 * within the sync window, and not on a cancelled assignment. Posts with an open
 * dispute stay in. Posts with no recorded first verification (legacy timing) are skipped.
 * Skipped posts make a page shorter than requested; `continueCursor` still moves past
 * them, so paging covers every eligible post once.
 */
export async function listEarningPosts(
  ctx: QueryCtx,
  now: number,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<EarningPost>> {
  const result = await ctx.db
    .query("posts")
    .withIndex("by_isVerified_and_isActive_and_firstVerifiedAt", (q) =>
      q
        .eq("isVerified", true)
        .eq("isActive", true)
        .gte("firstVerifiedAt", now - SYNC_WINDOW_MS),
    )
    .paginate(paginationOpts);
  // A page's posts often share an assignment, so each one is read once.
  const cancelled = new Map<Id<"assignments">, boolean>();
  const page: EarningPost[] = [];
  for (const post of result.page) {
    const submission = await ctx.db.get("submissions", post.submissionId);
    if (submission === null) continue;
    let isCancelled = cancelled.get(submission.assignmentId);
    if (isCancelled === undefined) {
      const assignment = await ctx.db.get("assignments", submission.assignmentId);
      isCancelled = assignment === null || assignment.status === "cancelled";
      cancelled.set(submission.assignmentId, isCancelled);
    }
    if (!isCancelled) page.push({ postId: post._id, xPostId: post.xPostId });
  }
  return { ...result, page };
}
