import { paginationOptsValidator, type PaginationResult } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canViewResource, type ResourceViewer } from "../lib/authz";
import { apiError } from "../lib/errors";
import { withRowsReadCap } from "../lib/pagination";
import schema from "../schema";

/** The same public view for every role; internal deduplication and actor IDs stay private. */
export const payoutView = schema
  .doc("payouts")
  .pick(
    "_id",
    "_creationTime",
    "assignmentId",
    "creatorId",
    "companyId",
    "campaignId",
    "postId",
    "earningPeriod",
    "amountCents",
    "currency",
    "reviewRequestedAt",
    "approvalDueAt",
    "approvalStatus",
    "approvedAt",
    "approvalSource",
    "paymentStatus",
    "transferredAt",
  );
export type PayoutView = Infer<typeof payoutView>;

/** Selects fields explicitly so future stored fields are private by default. */
function toPayoutView(payout: Doc<"payouts">): PayoutView {
  return {
    _id: payout._id,
    _creationTime: payout._creationTime,
    assignmentId: payout.assignmentId,
    creatorId: payout.creatorId,
    companyId: payout.companyId,
    campaignId: payout.campaignId,
    amountCents: payout.amountCents,
    currency: payout.currency,
    reviewRequestedAt: payout.reviewRequestedAt,
    approvalDueAt: payout.approvalDueAt,
    approvalStatus: payout.approvalStatus,
    paymentStatus: payout.paymentStatus,
    ...(payout.postId === undefined ? {} : { postId: payout.postId }),
    ...(payout.earningPeriod === undefined ? {} : { earningPeriod: payout.earningPeriod }),
    ...(payout.approvedAt === undefined ? {} : { approvedAt: payout.approvedAt }),
    ...(payout.approvalSource === undefined ? {} : { approvalSource: payout.approvalSource }),
    ...(payout.transferredAt === undefined ? {} : { transferredAt: payout.transferredAt }),
  };
}

/** Reads historical ownership from the payout without requiring its live parents. */
export async function requirePayout(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  payoutId: Id<"payouts">,
): Promise<PayoutView> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null || !canViewResource(viewer, payout)) {
    throw apiError("not_found", { resource: "payout" });
  }
  return toPayoutView(payout);
}

export const payoutListFilters = schema
  .doc("payouts")
  .pick("assignmentId", "campaignId", "approvalStatus")
  .partial()
  .extend({ paginationOpts: paginationOptsValidator });
export type PayoutListFilters = Infer<typeof payoutListFilters>;

/**
 * Lists the viewer's payouts newest review request first. Parent filters narrow
 * stored ownership, so foreign scopes return no rows and missing parents do not
 * hide history. Assignment and campaign filters may be combined.
 */
export async function listPayouts(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  options: PayoutListFilters,
): Promise<PaginationResult<PayoutView>> {
  const { assignmentId, campaignId, paginationOpts } = options;
  let query = payoutsOf(ctx, viewer, options);
  const hasParentScope = assignmentId !== undefined || campaignId !== undefined;
  // Parent indexes bound the scan; ownership is still checked on every stored
  // payout instead of trusting the parent to exist or have its original owner.
  if (hasParentScope && viewer.role === "creator") {
    query = query.filter((q) => q.eq(q.field("creatorId"), viewer.creatorId));
  } else if (hasParentScope && viewer.role === "company") {
    query = query.filter((q) => q.eq(q.field("companyId"), viewer.companyId));
  }
  if (assignmentId !== undefined && campaignId !== undefined) {
    query = query.filter((q) => q.eq(q.field("campaignId"), campaignId));
  }
  const result = await query
    .order("desc")
    .paginate(hasParentScope ? withRowsReadCap(paginationOpts) : paginationOpts);
  return { ...result, page: result.page.map(toPayoutView) };
}

/** Paired indexes keep the same chronological ordering with or without a status filter. */
function payoutsOf(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  { assignmentId, campaignId, approvalStatus }: PayoutListFilters,
) {
  const payouts = ctx.db.query("payouts");
  if (assignmentId !== undefined) {
    return approvalStatus === undefined
      ? payouts.withIndex("by_assignmentId_and_reviewRequestedAt", (q) =>
          q.eq("assignmentId", assignmentId),
        )
      : payouts.withIndex("by_assignmentId_and_approvalStatus_and_reviewRequestedAt", (q) =>
          q.eq("assignmentId", assignmentId).eq("approvalStatus", approvalStatus),
        );
  }
  if (campaignId !== undefined) {
    return approvalStatus === undefined
      ? payouts.withIndex("by_campaignId_and_reviewRequestedAt", (q) =>
          q.eq("campaignId", campaignId),
        )
      : payouts.withIndex("by_campaignId_and_approvalStatus_and_reviewRequestedAt", (q) =>
          q.eq("campaignId", campaignId).eq("approvalStatus", approvalStatus),
        );
  }
  switch (viewer.role) {
    case "creator":
      return approvalStatus === undefined
        ? payouts.withIndex("by_creatorId_and_reviewRequestedAt", (q) =>
            q.eq("creatorId", viewer.creatorId),
          )
        : payouts.withIndex("by_creatorId_and_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("creatorId", viewer.creatorId).eq("approvalStatus", approvalStatus),
          );
    case "company":
      return approvalStatus === undefined
        ? payouts.withIndex("by_companyId_and_reviewRequestedAt", (q) =>
            q.eq("companyId", viewer.companyId),
          )
        : payouts.withIndex("by_companyId_and_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("companyId", viewer.companyId).eq("approvalStatus", approvalStatus),
          );
    case "operator":
      return approvalStatus === undefined
        ? payouts.withIndex("by_reviewRequestedAt")
        : payouts.withIndex("by_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("approvalStatus", approvalStatus),
          );
  }
}
