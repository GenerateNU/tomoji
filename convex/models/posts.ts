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

// `<handle>/status/<id>`, `i/status/<id>`, or `i/web/status/<id>`, with any
// trailing parts like `/photo/1`. A handle is 1-15 letters, digits, or
// underscores. Post ids are numeric, which tells a post apart from other pages.
const X_POST_PATH = /^\/(?:i(?:\/web)?|([A-Za-z0-9_]{1,15}))\/status\/(\d{1,25})(?:\/.*)?$/;

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
 * Checks that no post other than `postId` uses this X post, so one post can't
 * count for two submissions. The index is not unique, so check here.
 *
 * @throws `conflict` with `post_already_used` if another post uses it.
 */
async function requirePostUnused(
  ctx: MutationCtx,
  xPostId: string,
  postId?: Id<"posts">,
): Promise<void> {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_xPostId", (q) => q.eq("xPostId", xPostId))
    .take(2);
  if (posts.some((post) => post._id !== postId)) {
    throw apiError("conflict", { reason: "post_already_used" });
  }
}

/**
 * Records the live X post for the creator's approved submission. The post
 * starts unverified; `postedAt` is set when an operator verifies it.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the submission isn't approved, the assignment
 * isn't active, or the URL isn't an X post link.
 * @throws `conflict` if the submission already has a post, or another post
 * uses the same X post.
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
  // One post per submission, and so per assignment, since an assignment has at
  // most one approved submission. The index is not unique, so check here.
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_posted" });
  }
  await requirePostUnused(ctx, xPostId);

  return await ctx.db.insert("posts", {
    submissionId: submission._id,
    campaignId: assignment.campaignId,
    url,
    xPostId,
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

/**
 * The post, for an operator changing its verification. Posts freeze once the
 * assignment ends, since payouts are settled from them; later fixes go
 * through disputes.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` with `assignment_not_active` if the assignment ended.
 */
async function requireOperatorEditablePost(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<Doc<"posts">> {
  const { post, assignment } = await requirePostAccess(ctx, { role: "operator" }, postId);
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  return post;
}

/** The creator-editable fields of a post. */
export const postUpdate = v.object({ url: v.string() });
export type PostUpdate = Infer<typeof postUpdate>;

/**
 * Replaces the link on the creator's unverified post. `postedAt` and metrics
 * belonged to the old link, so both are cleared.
 *
 * @throws `not_found` if the post doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the post is verified, the assignment isn't
 * active, or the URL isn't an X post link.
 * @throws `conflict` if another post uses the same X post.
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
  const { url, xPostId } = requirePostUrl(fields.url);
  await requirePostUnused(ctx, xPostId, postId);
  const patch = {
    url,
    xPostId,
    // Patching a field to undefined removes it.
    postedAt: undefined,
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
  if (!Number.isSafeInteger(postedAt) || postedAt < 0 || postedAt > Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_posted_at" });
  }
  await ctx.db.patch("posts", postId, { isVerified: true, postedAt });
  return { ...post, isVerified: true, postedAt };
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
  await ctx.db.patch("posts", postId, { isVerified: false, postedAt: undefined });
  // Read it back so the cleared field is absent rather than `undefined`.
  return (await ctx.db.get("posts", postId))!;
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
