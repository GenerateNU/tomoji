import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { hasOpenDispute } from "./disputes";
import { listSubmissionQueue } from "./submissionQueue";
import { requireSubmission } from "./submissions";

const CAMPAIGN_LIMIT = 100;
const POST_LIMIT = 200;
const SNAPSHOT_LIMIT = 1_000;
const PAYOUT_LIMIT = 500;
const OFFER_LIMIT = 100;
const LIVE_CAMPAIGN_LIMIT = 1_000;
const DAY = 86_400_000;

/** Caller-selected period boundaries, in Unix milliseconds; at most 31 days. */
export const companyHomeRange = v.object({ from: v.number(), to: v.number() });
type CompanyHomeRange = Infer<typeof companyHomeRange>;
const amounts = v.array(v.object({ currency: v.string(), amount: v.number() }));

export const companyOverview = v.object({
  liveCampaigns: v.object({ value: v.number(), capped: v.boolean() }),
  spend: v.object({ amounts, campaignCount: v.number(), isPartial: v.boolean() }),
  performance: v.object({
    views: v.union(v.number(), v.null()),
    history: v.array(v.object({ at: v.number(), views: v.union(v.number(), v.null()) })),
    postsWithoutMetrics: v.number(),
    isPartial: v.boolean(),
  }),
});

/** Bounds chart history and rejects invalid or reversed period boundaries. */
function requireRange({ from, to }: CompanyHomeRange) {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to <= from ||
    to - from > 31 * DAY
  ) {
    throw apiError("invalid_state", { reason: "summary_range_invalid" });
  }
}

/** Requires a finite millisecond display clock for reactive offer expiry. */
function requireDisplayTime(asOf: number) {
  if (!Number.isSafeInteger(asOf) || asOf < 0) {
    throw apiError("invalid_state", { reason: "summary_range_invalid" });
  }
}

/** Currency minor units stay separate; no implicit conversion between currencies. */
function sumAmounts(payouts: Doc<"payouts">[]): Infer<typeof amounts> {
  const totals = new Map<string, number>();
  for (const payout of payouts) {
    totals.set(payout.currency, (totals.get(payout.currency) ?? 0) + payout.amount);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({
      currency,
      amount,
    }));
}

/** Live counts use current campaign state; spend uses transfer time, not earning time. */
export async function getCompanyOverview(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  range: CompanyHomeRange,
): Promise<Infer<typeof companyOverview>> {
  requireRange(range);
  const [campaigns, live, paid] = await Promise.all([
    ctx.db
      .query("campaigns")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(CAMPAIGN_LIMIT + 1),
    ctx.db
      .query("campaigns")
      .withIndex("by_companyId_and_status", (q) =>
        q.eq("companyId", companyId).eq("status", "open"),
      )
      .take(LIVE_CAMPAIGN_LIMIT + 1),
    ctx.db
      .query("payouts")
      .withIndex("by_companyId_and_transferredAt", (q) =>
        q.eq("companyId", companyId).gte("transferredAt", range.from).lt("transferredAt", range.to),
      )
      .order("desc")
      .take(PAYOUT_LIMIT + 1),
  ]);
  const payouts = paid.slice(0, PAYOUT_LIMIT).filter((p) => p.paymentStatus === "transferred");
  return {
    liveCampaigns: {
      value: Math.min(live.length, LIVE_CAMPAIGN_LIMIT),
      capped: live.length > LIVE_CAMPAIGN_LIMIT,
    },
    // Gross payout obligations transferred to creators, excluding provider fees and duplicate charges.
    spend: {
      amounts: sumAmounts(payouts),
      campaignCount: new Set(payouts.map((p) => p.campaignId)).size,
      isPartial: paid.length > PAYOUT_LIMIT,
    },
    performance: await getPerformance(ctx, campaigns, range),
  };
}

/** Aggregates verified active posts under a shared post and snapshot read budget. */
async function getPerformance(
  ctx: QueryCtx,
  campaigns: Doc<"campaigns">[],
  range: CompanyHomeRange,
): Promise<Infer<typeof companyOverview>["performance"]> {
  const posts: Doc<"posts">[] = [];
  let isPartial = campaigns.length > CAMPAIGN_LIMIT;
  let remainingPosts = POST_LIMIT;
  for (const [index, campaign] of campaigns.slice(0, CAMPAIGN_LIMIT).entries()) {
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_campaignId_and_isActive", (q) =>
        q.eq("campaignId", campaign._id).eq("isActive", true),
      )
      .take(remainingPosts + 1);
    if (rows.length > remainingPosts) isPartial = true;
    posts.push(...rows.slice(0, remainingPosts).filter((p) => p.isVerified));
    remainingPosts -= Math.min(rows.length, remainingPosts);
    if (remainingPosts === 0) {
      isPartial ||= index < Math.min(campaigns.length, CAMPAIGN_LIMIT) - 1;
      break;
    }
  }

  // Carry forward observed counts only. An unknown baseline stays null until measured.
  const counts = new Map<Id<"posts">, number | null>();
  const observations = new Map<number, { postId: Id<"posts">; views: number }[]>();
  let remainingSnapshots = SNAPSHOT_LIMIT;
  for (const post of posts) {
    const baseline = await ctx.db
      .query("postViewSnapshots")
      .withIndex("by_postId_and_observedAt", (q) =>
        q.eq("postId", post._id).lt("observedAt", range.from),
      )
      .order("desc")
      .first();
    counts.set(post._id, baseline?.views ?? null);
    const rows = await ctx.db
      .query("postViewSnapshots")
      .withIndex("by_postId_and_observedAt", (q) =>
        q.eq("postId", post._id).gte("observedAt", range.from).lt("observedAt", range.to),
      )
      .take(remainingSnapshots + 1);
    if (rows.length > remainingSnapshots) isPartial = true;
    for (const row of rows.slice(0, remainingSnapshots)) {
      const bucket = observations.get(row.observedAt) ?? [];
      bucket.push({ postId: post._id, views: row.views });
      observations.set(row.observedAt, bucket);
    }
    remainingSnapshots -= Math.min(rows.length, remainingSnapshots);
  }
  /** Unknown observations prevent claiming an exact historical total. */
  const total = () =>
    [...counts.values()].some((n) => n === null)
      ? null
      : [...counts.values()].reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const history = posts.length === 0 ? [] : [{ at: range.from, views: total() }];
  for (const [at, bucket] of [...observations].sort(([a], [b]) => a - b)) {
    for (const { postId, views } of bucket) counts.set(postId, views);
    const point = { at, views: total() };
    if (history.at(-1)?.at === at) history[history.length - 1] = point;
    else history.push(point);
  }
  const postsWithoutMetrics = posts.filter((p) => p.views === undefined).length;
  return {
    views: postsWithoutMetrics === 0 ? posts.reduce((sum, p) => sum + (p.views ?? 0), 0) : null,
    history,
    postsWithoutMetrics,
    isPartial,
  };
}

const offerPreview = v.object({
  applicationId: v.id("applications"),
  opportunityId: v.id("opportunities"),
  opportunityTitle: v.string(),
  creatorName: v.string(),
  profilePictureMediaId: v.union(v.id("mediaUploads"), v.null()),
  expiresAt: v.number(),
});
export const companyOffers = v.object({
  count: v.number(),
  rows: v.array(offerPreview),
  isPartial: v.boolean(),
});

/** Counts unexpired company offers and joins the five soonest-expiring previews. */
export async function getCompanyOffers(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  asOf: number,
): Promise<Infer<typeof companyOffers>> {
  requireDisplayTime(asOf);
  const rows = await ctx.db
    .query("applications")
    .withIndex("by_companyId_and_status_and_offerExpiresAt", (q) =>
      q.eq("companyId", companyId).eq("status", "offered").gt("offerExpiresAt", asOf),
    )
    .take(OFFER_LIMIT + 1);
  const previews: Infer<typeof offerPreview>[] = [];
  for (const row of rows.slice(0, 5)) {
    if (row.offerExpiresAt === undefined) continue;
    const [opportunity, creator] = await Promise.all([
      ctx.db.get("opportunities", row.opportunityId),
      ctx.db.get("creators", row.creatorId),
    ]);
    if (opportunity?.companyId !== companyId || creator === null) continue;
    const user = await ctx.db.get("users", creator.userId);
    previews.push({
      applicationId: row._id,
      opportunityId: opportunity._id,
      opportunityTitle: opportunity.title,
      creatorName: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "Creator",
      profilePictureMediaId: user?.profilePictureMediaId ?? null,
      expiresAt: row.offerExpiresAt,
    });
  }
  return {
    count: Math.min(rows.length, OFFER_LIMIT),
    rows: previews,
    isPartial: rows.length > OFFER_LIMIT,
  };
}

const draftPreview = v.object({
  submissionId: v.id("submissions"),
  assignmentId: v.id("assignments"),
  title: v.string(),
  creatorName: v.string(),
  submittedAt: v.number(),
  mediaId: v.union(v.id("mediaUploads"), v.null()),
});
export const companyDrafts = v.object({
  count: v.number(),
  rows: v.array(draftPreview),
  isPartial: v.boolean(),
});

/** Reuses submission review eligibility and excludes drafts still being processed by AI. */
export async function getCompanyDrafts(
  ctx: QueryCtx,
  companyId: Id<"companies">,
): Promise<Infer<typeof companyDrafts>> {
  const queue = await listSubmissionQueue(ctx, companyId);
  const ready: Infer<typeof draftPreview>[] = [];
  for (const row of queue.rows.filter((r) => r.status === "pending")) {
    const draft = await requireSubmission(ctx, { role: "company", companyId }, row.submissionId);
    if (draft.aiReview && !["manualReview", "completed"].includes(draft.aiReview.status)) continue;
    ready.push({
      submissionId: row.submissionId,
      assignmentId: row.assignmentId,
      title: row.title,
      creatorName: row.creatorName,
      submittedAt: row.submittedAt,
      mediaId: draft.mediaId ?? null,
    });
  }
  ready.sort((a, b) => b.submittedAt - a.submittedAt);
  return { count: ready.length, rows: ready.slice(0, 4), isPartial: queue.isCapped };
}

export const companyEarnings = v.object({
  // A creator with any outstanding payout is pending, even if another payout was approved.
  creators: v.object({ pending: v.number(), approved: v.number(), total: v.number() }),
  pending: v.object({
    amounts,
    blockedAmounts: amounts,
    nextApprovalDueAt: v.union(v.number(), v.null()),
  }),
  approvedInPeriod: v.object({ amounts }),
  canApprove: v.boolean(),
  isPartial: v.boolean(),
});

/** Summarizes outstanding and period-approved earnings without promising disputed payments. */
export async function getCompanyEarnings(
  ctx: QueryCtx,
  membership: Doc<"companyUsers">,
  range: CompanyHomeRange,
): Promise<Infer<typeof companyEarnings>> {
  requireRange(range);
  const pendingQuery = ctx.db
    .query("payouts")
    .withIndex("by_companyId_and_approvalStatus_and_reviewRequestedAt", (q) =>
      q.eq("companyId", membership.companyId).eq("approvalStatus", "pending"),
    )
    .order("desc")
    .take(PAYOUT_LIMIT + 1);
  const approvedQuery = ctx.db
    .query("payouts")
    .withIndex("by_companyId_and_approvalStatus_and_approvedAt", (q) =>
      q
        .eq("companyId", membership.companyId)
        .eq("approvalStatus", "approved")
        .gte("approvedAt", range.from)
        .lt("approvedAt", range.to),
    )
    .order("desc")
    .take(PAYOUT_LIMIT + 1);
  const [pendingRows, approvedRows] = await Promise.all([pendingQuery, approvedQuery]);
  const pending = pendingRows.slice(0, PAYOUT_LIMIT);
  const approved = approvedRows.slice(0, PAYOUT_LIMIT);
  const pendingCreators = new Set(pending.map((p) => p.creatorId));
  const approvedCreators = new Set(approved.map((p) => p.creatorId));
  for (const creatorId of pendingCreators) approvedCreators.delete(creatorId);
  const blocked: Doc<"payouts">[] = [];
  const disputeHolds = new Map<Id<"assignments">, boolean>();
  let nextApprovalDueAt: number | null = null;
  for (const payout of pending) {
    if (!disputeHolds.has(payout.assignmentId)) {
      disputeHolds.set(payout.assignmentId, await hasOpenDispute(ctx, payout.assignmentId));
    }
    if (disputeHolds.get(payout.assignmentId)) blocked.push(payout);
    else nextApprovalDueAt = Math.min(nextApprovalDueAt ?? Infinity, payout.approvalDueAt);
  }
  return {
    creators: {
      pending: pendingCreators.size,
      approved: approvedCreators.size,
      total: pendingCreators.size + approvedCreators.size,
    },
    pending: {
      amounts: sumAmounts(pending),
      blockedAmounts: sumAmounts(blocked),
      nextApprovalDueAt,
    },
    approvedInPeriod: {
      amounts: sumAmounts(approved),
    },
    canApprove: membership.role === "admin",
    isPartial: pendingRows.length > PAYOUT_LIMIT || approvedRows.length > PAYOUT_LIMIT,
  };
}
