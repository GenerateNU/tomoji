import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { mergedStream, stream } from "convex-helpers/server/stream";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import schema from "../schema";

/**
 * Creates a creator's assignment on an open, ungated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist or its company is
 * inactive.
 * @throws `invalid_state` if the opportunity or its campaign is not open, the
 * deadline has passed, the opportunity is gated, or no slots remain.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function claimAssignment(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<Id<"assignments">> {
  const { opportunity, campaign } = await requireOpportunityWithCampaign(ctx, opportunityId);
  const company = await ctx.db.get("companies", campaign.companyId);
  if (company === null || !company.isActive) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  // The deadline cron may not have closed the opportunity yet.
  if (opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "opportunity_expired" });
  }
  // Gated opportunities are joined by accepting an offer on an application.
  if (opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_gated" });
  }
  return await createAssignment(ctx, opportunity, campaign, creatorId);
}

/**
 * Creates the assignment for a creator who accepted an offer on a gated
 * opportunity. Call it in the same mutation that marks the application
 * accepted; it does not read or check the application. Offers can be accepted
 * while the opportunity or campaign is paused.
 *
 * @throws `not_found` if the opportunity does not exist.
 * @throws `invalid_state` if the opportunity is a draft or closed, is ungated,
 * or has no slots left.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function createAssignmentFromOffer(
  ctx: MutationCtx,
  args: { opportunityId: Id<"opportunities">; creatorId: Id<"creators"> },
): Promise<Id<"assignments">> {
  const { opportunity, campaign } = await requireOpportunityWithCampaign(ctx, args.opportunityId);
  if (opportunity.status !== "open" && opportunity.status !== "paused") {
    throw apiError("invalid_state", { reason: "opportunity_closed" });
  }
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
  }
  return await createAssignment(ctx, opportunity, campaign, args.creatorId);
}

async function requireOpportunityWithCampaign(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<{ opportunity: Doc<"opportunities">; campaign: Doc<"campaigns"> }> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  const campaign = opportunity && (await ctx.db.get("campaigns", opportunity.campaignId));
  if (!opportunity || !campaign) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return { opportunity, campaign };
}

/**
 * Takes a slot and inserts a termsPending assignment with the opportunity's
 * current terms, so later opportunity edits do not change the deal.
 *
 * The slot check and increment read and write the opportunity in this
 * transaction, so when two creators race for the last slot Convex retries the
 * later one against the updated count and it fails as full.
 */
async function createAssignment(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
  campaign: Doc<"campaigns">,
  creatorId: Id<"creators">,
): Promise<Id<"assignments">> {
  // One assignment per creator per opportunity, whatever its status. The index
  // is not unique, so this check is what blocks double claims and retries.
  const existing = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", opportunity._id).eq("creatorId", creatorId),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_assigned" });
  }
  if (opportunity.numFilledSlots >= opportunity.maxSlots) {
    throw apiError("invalid_state", { reason: "opportunity_full" });
  }

  const assignmentId = await ctx.db.insert("assignments", {
    opportunityId: opportunity._id,
    creatorId,
    companyId: campaign.companyId,
    campaignId: campaign._id,
    fixedFeeCents: opportunity.fixedFeeCents,
    cpmRateCents: opportunity.cpmRateCents,
    paymentCapCents: opportunity.paymentCapCents,
    usesAiReview: opportunity.usesAiReviewDefault,
    status: "termsPending",
  });
  await ctx.db.patch("opportunities", opportunity._id, {
    numFilledSlots: opportunity.numFilledSlots + 1,
  });
  return assignmentId;
}

/** Creator responses include delivery time but not the company user's audit ID. */
export const creatorAssignment = schema
  .doc("assignments")
  .pick(
    "_id",
    "_creationTime",
    "opportunityId",
    "creatorId",
    "companyId",
    "campaignId",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
    "usesAiReview",
    "status",
    "productAccessDeliveredAt",
  );
export type CreatorAssignment = Infer<typeof creatorAssignment>;

/** Explicitly selects fields so future stored fields do not become public by default. */
export function toCreatorAssignment(assignment: Doc<"assignments">): CreatorAssignment {
  const result: CreatorAssignment = {
    _id: assignment._id,
    _creationTime: assignment._creationTime,
    opportunityId: assignment.opportunityId,
    creatorId: assignment.creatorId,
    companyId: assignment.companyId,
    campaignId: assignment.campaignId,
    fixedFeeCents: assignment.fixedFeeCents,
    cpmRateCents: assignment.cpmRateCents,
    paymentCapCents: assignment.paymentCapCents,
    usesAiReview: assignment.usesAiReview,
    status: assignment.status,
  };
  if (assignment.productAccessDeliveredAt !== undefined) {
    result.productAccessDeliveredAt = assignment.productAccessDeliveredAt;
  }
  return result;
}

/** Who is reading an assignment, resolved from the caller by the route. */
export type AssignmentViewer =
  | { role: "operator" }
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> };

/**
 * Returns an assignment the viewer may see: creators see their own, company
 * users see their company's, and operators see all.
 *
 * @throws `not_found` if the assignment does not exist or the viewer may not
 * see it, so callers cannot probe for other assignments.
 */
export async function requireAssignment(
  ctx: QueryCtx | MutationCtx,
  viewer: AssignmentViewer,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null || !canViewAssignment(viewer, assignment)) {
    throw apiError("not_found", { resource: "assignment" });
  }
  return assignment;
}

function canViewAssignment(viewer: AssignmentViewer, assignment: Doc<"assignments">): boolean {
  switch (viewer.role) {
    case "operator":
      return true;
    case "creator":
      return assignment.creatorId === viewer.creatorId;
    case "company":
      return assignment.companyId === viewer.companyId;
  }
}

/**
 * Records product access delivery for the authenticated member's assignments.
 * Validates the entire batch before writing. Repeated IDs appear once in the
 * result, in first-occurrence order; existing delivery details stay unchanged.
 *
 * @throws `invalid_state` for fewer than 1 or more than 100 input IDs, or a new
 * delivery confirmation on a cancelled assignment.
 * @throws `not_found` if any assignment is missing or belongs to another company.
 */
export async function markAssignmentProductAccessDelivered(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  assignmentIds: Id<"assignments">[],
): Promise<Doc<"assignments">[]> {
  if (assignmentIds.length === 0 || assignmentIds.length > 100) {
    throw apiError("invalid_state", { reason: "invalid_batch_size" });
  }

  const assignments = await Promise.all(
    [...new Set(assignmentIds)].map((assignmentId) =>
      requireAssignment(ctx, { role: "company", companyId: membership.companyId }, assignmentId),
    ),
  );
  for (const assignment of assignments) {
    if (assignment.productAccessDeliveredAt === undefined && assignment.status === "cancelled") {
      throw apiError("invalid_state", { reason: "assignment_cancelled" });
    }
  }

  const delivery = {
    productAccessDeliveredAt: Date.now(),
    productAccessDeliveredBy: membership._id,
  };
  return await Promise.all(
    assignments.map(async (assignment) => {
      if (assignment.productAccessDeliveredAt !== undefined) return assignment;
      await ctx.db.patch("assignments", assignment._id, delivery);
      return { ...assignment, ...delivery };
    }),
  );
}

export const assignmentListFilters = schema
  .doc("assignments")
  .pick("opportunityId", "status")
  .partial()
  .extend({
    campaignId: v.optional(v.id("campaigns")),
    paginationOpts: paginationOptsValidator,
  });

/**
 * Returns one page of the company's assignments, optionally filtered by
 * opportunity, campaign, and status. Results are ordered by status, then
 * newest first within each status.
 *
 * @throws `not_found` if the opportunity or campaign belongs to another
 * company, or the opportunity is not in the given campaign.
 */
export async function listAssignments(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: Infer<typeof assignmentListFilters>,
): Promise<PaginationResult<Doc<"assignments">>> {
  const { opportunityId, campaignId, status, paginationOpts } = options;

  if (opportunityId !== undefined) {
    const opportunity = await ctx.db.get("opportunities", opportunityId);
    const campaign = opportunity && (await ctx.db.get("campaigns", opportunity.campaignId));
    if (
      !opportunity ||
      !campaign ||
      campaign.companyId !== companyId ||
      (campaignId !== undefined && opportunity.campaignId !== campaignId)
    ) {
      throw apiError("not_found", { resource: "opportunity" });
    }
    return await ctx.db
      .query("assignments")
      .withIndex("by_opportunityId_and_status", (q) => {
        const range = q.eq("opportunityId", opportunityId);
        return status === undefined ? range : range.eq("status", status);
      })
      .order("desc")
      .paginate(paginationOpts);
  }

  if (campaignId !== undefined) {
    const campaign = await ctx.db.get("campaigns", campaignId);
    if (campaign === null || campaign.companyId !== companyId) {
      throw apiError("not_found", { resource: "campaign" });
    }
    return await ctx.db
      .query("assignments")
      .withIndex("by_campaignId_and_status", (q) => {
        const range = q.eq("campaignId", campaignId);
        return status === undefined ? range : range.eq("status", status);
      })
      .order("desc")
      .paginate(paginationOpts);
  }

  return await ctx.db
    .query("assignments")
    .withIndex("by_companyId_and_status", (q) => {
      const range = q.eq("companyId", companyId);
      return status === undefined ? range : range.eq("status", status);
    })
    .order("desc")
    .paginate(paginationOpts);
}

/** Current assignments still need work; past ones are finished either way. */
export const assignmentPhase = v.union(v.literal("current"), v.literal("past"));

const PHASE_STATUSES = {
  current: ["termsPending", "active"],
  past: ["completed", "cancelled"],
} as const satisfies Record<Infer<typeof assignmentPhase>, Doc<"assignments">["status"][]>;

export const creatorAssignmentListFilters = v.object({
  phase: assignmentPhase,
  paginationOpts: paginationOptsValidator,
});

/** Returns one page of a creator's current or past assignments, newest first. */
export async function listCreatorAssignments(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  options: Infer<typeof creatorAssignmentListFilters>,
): Promise<PaginationResult<Doc<"assignments">>> {
  const streams = PHASE_STATUSES[options.phase].map((status) =>
    stream(ctx.db, schema)
      .query("assignments")
      .withIndex("by_creatorId_and_status", (q) =>
        q.eq("creatorId", creatorId).eq("status", status),
      )
      .order("desc"),
  );
  return await mergedStream(streams, ["_creationTime"]).paginate(options.paginationOpts);
}

/**
 * Accepts the terms on the creator's own assignment, making it active.
 *
 * @throws `not_found` if the assignment does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export async function acceptAssignmentTerms(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await requirePendingAssignment(
    ctx,
    { role: "creator", creatorId },
    assignmentId,
  );
  await ctx.db.patch("assignments", assignment._id, { status: "active" });
  return { ...assignment, status: "active" };
}

/**
 * Declines the terms on the creator's own assignment, cancelling it and
 * freeing its slot.
 *
 * @throws `not_found` if the assignment does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export async function declineAssignmentTerms(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await requirePendingAssignment(
    ctx,
    { role: "creator", creatorId },
    assignmentId,
  );
  return await cancelAssignment(ctx, assignment);
}

/**
 * Cancels one of the company's assignments before the creator accepts the
 * terms, freeing its slot. Active assignments go through disputes instead.
 *
 * @throws `not_found` if the assignment does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export async function cancelPendingAssignment(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await requirePendingAssignment(
    ctx,
    { role: "company", companyId },
    assignmentId,
  );
  return await cancelAssignment(ctx, assignment);
}

async function requirePendingAssignment(
  ctx: MutationCtx,
  viewer: AssignmentViewer,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await requireAssignment(ctx, viewer, assignmentId);
  if (assignment.status !== "termsPending") {
    throw apiError("invalid_state", { reason: "assignment_not_pending" });
  }
  return assignment;
}

/**
 * Cancels a termsPending or active assignment and frees its slot. Does no
 * authorization: callers such as the company cancel route or dispute
 * resolution decide who may cancel and from which status.
 *
 * @throws `invalid_state` if the assignment is already completed or cancelled.
 */
export async function cancelAssignment(
  ctx: MutationCtx,
  assignment: Doc<"assignments">,
): Promise<Doc<"assignments">> {
  if (assignment.status !== "termsPending" && assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_cancellable" });
  }
  await ctx.db.patch("assignments", assignment._id, { status: "cancelled" });
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity !== null && opportunity.numFilledSlots > 0) {
    await ctx.db.patch("opportunities", opportunity._id, {
      numFilledSlots: opportunity.numFilledSlots - 1,
    });
  }
  return { ...assignment, status: "cancelled" };
}

/**
 * Marks an active assignment completed. The slot stays filled. Does no
 * authorization; what triggers completion is not decided yet.
 *
 * @throws `not_found` if the assignment does not exist.
 * @throws `invalid_state` if the assignment is not active.
 */
export async function completeAssignment(
  ctx: MutationCtx,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null) {
    throw apiError("not_found", { resource: "assignment" });
  }
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  await ctx.db.patch("assignments", assignment._id, { status: "completed" });
  return { ...assignment, status: "completed" };
}
