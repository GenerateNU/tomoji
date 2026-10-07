import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireAssignment, type AssignmentViewer } from "./assignments";
import { getLatestSubmission } from "./submissions";

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

// An X handle is 1-15 letters, digits, or underscores; post ids are numeric.
const X_POST_PATH = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/;

/**
 * Returns the canonical `https://x.com/<handle>/status/<id>` form of an X post
 * link, so the same post always has the same stored URL.
 *
 * @throws `invalid_state` with `url_invalid` if it isn't a link to an X post.
 */
function requirePostUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw apiError("invalid_state", { reason: "url_invalid" });
  }
  // `x.com@evil.example` goes to evil.example, so refuse login details outright.
  const match = X_POST_PATH.exec(url.pathname);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    !X_HOSTS.has(url.hostname) ||
    match === null
  ) {
    throw apiError("invalid_state", { reason: "url_invalid" });
  }
  return `https://x.com/${match[1]}/status/${match[2]}`;
}

/**
 * Records the live X post for the creator's approved submission. The post
 * starts unverified, and `postedAt` is when the link was submitted.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the submission isn't approved, the assignment
 * isn't active, or the URL isn't an X post link.
 * @throws `conflict` if the submission already has a post.
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
  const url = requirePostUrl(fields.url);
  // One post per submission, and so per assignment, since an assignment has at
  // most one approved submission. The index is not unique, so check here.
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_posted" });
  }

  return await ctx.db.insert("posts", {
    submissionId: submission._id,
    campaignId: assignment.campaignId,
    url,
    postedAt: Date.now(),
    isVerified: false,
  });
}

/**
 * Returns a post the viewer may see: creators see their own, company users see
 * their company's, and operators see all.
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

/** The creator-editable fields of a post. */
export const postUpdate = v.object({ url: v.string() });
export type PostUpdate = Infer<typeof postUpdate>;

/**
 * Replaces the link on the creator's unverified post. A new link is a new
 * post on X, so `postedAt` resets and metrics fetched for the old link are
 * cleared.
 *
 * @throws `not_found` if the post doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the post is verified, the assignment isn't
 * active, or the URL isn't an X post link.
 */
export async function updatePost(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  postId: Id<"posts">,
  fields: PostUpdate,
): Promise<Doc<"posts">> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "creator", creatorId }, postId);
  if (post.isVerified) {
    throw apiError("invalid_state", { reason: "post_verified" });
  }
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  const patch = {
    url: requirePostUrl(fields.url),
    postedAt: Date.now(),
    // Patching a field to undefined removes it.
    likes: undefined,
    comments: undefined,
    reposts: undefined,
    views: undefined,
    metricsUpdatedAt: undefined,
  };
  await ctx.db.patch("posts", postId, patch);
  // Read it back so the cleared fields are absent rather than `undefined`.
  return (await ctx.db.get("posts", postId))!;
}

/**
 * Marks an unverified post verified. Operators do this by hand for now;
 * automatic verification through the X API is a separate ticket.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the post is already verified.
 */
export async function verifyPost(ctx: MutationCtx, postId: Id<"posts">): Promise<Doc<"posts">> {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  if (post.isVerified) {
    throw apiError("invalid_state", { reason: "post_already_verified" });
  }
  await ctx.db.patch("posts", postId, { isVerified: true });
  return { ...post, isVerified: true };
}

/**
 * Marks a verified post unverified, for example when an operator finds it
 * doesn't match the approved submission. The creator can then fix the link.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the post isn't verified.
 */
export async function unverifyPost(ctx: MutationCtx, postId: Id<"posts">): Promise<Doc<"posts">> {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  if (!post.isVerified) {
    throw apiError("invalid_state", { reason: "post_not_verified" });
  }
  await ctx.db.patch("posts", postId, { isVerified: false });
  return { ...post, isVerified: false };
}

/** A snapshot of a post's counts, as fetched from X. */
export const postMetrics = v.object({
  likes: v.number(),
  comments: v.number(),
  reposts: v.number(),
  views: v.number(),
});
export type PostMetrics = Infer<typeof postMetrics>;

/**
 * Stores a fresh snapshot of the post's counts. Only server code calls this,
 * so creators can't inflate the numbers their payout is based on.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` with `invalid_metrics` if a count isn't a
 * nonnegative whole number.
 */
export async function updatePostMetrics(
  ctx: MutationCtx,
  postId: Id<"posts">,
  metrics: PostMetrics,
): Promise<Doc<"posts">> {
  const post = await ctx.db.get("posts", postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  for (const field of ["likes", "comments", "reposts", "views"] as const) {
    if (!Number.isSafeInteger(metrics[field]) || metrics[field] < 0) {
      throw apiError("invalid_state", { reason: "invalid_metrics", field });
    }
  }
  const patch = { ...metrics, metricsUpdatedAt: Date.now() };
  await ctx.db.patch("posts", postId, patch);
  return { ...post, ...patch };
}

/** `list` takes exactly one of `assignmentId` or `campaignId`. */
export const postListFilters = v.object({
  assignmentId: v.optional(v.id("assignments")),
  campaignId: v.optional(v.id("campaigns")),
  paginationOpts: paginationOptsValidator,
});

/**
 * Returns one page of posts, newest first, for either an assignment or a
 * campaign. An assignment has at most one post. Campaign listing is for the
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
    // Approval is final, so if the assignment has an approved submission it's the latest.
    const submission = await getLatestSubmission(ctx, assignment._id);
    if (submission === null || submission.status !== "approved") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    return await ctx.db
      .query("posts")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .order("desc")
      .paginate(paginationOpts);
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
    .withIndex("by_campaignId", (q) => q.eq("campaignId", campaign._id))
    .order("desc")
    .paginate(paginationOpts);
}
