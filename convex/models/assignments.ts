import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
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

export const assignmentListFilters = schema
  .doc("assignments")
  .pick("opportunityId", "status")
  .partial()
  .extend({
    campaignId: v.optional(v.id("campaigns")),
    paginationOpts: paginationOptsValidator,
  });

/** Proves access to the requested parents, even when they have no assignments. */
async function requireAssignmentParents(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: { opportunityId?: Id<"opportunities">; campaignId?: Id<"campaigns"> },
): Promise<void> {
  const { opportunityId, campaignId } = options;
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
  } else if (campaignId !== undefined) {
    const campaign = await ctx.db.get("campaigns", campaignId);
    if (campaign === null || campaign.companyId !== companyId) {
      throw apiError("not_found", { resource: "campaign" });
    }
  }
}

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
  await requireAssignmentParents(ctx, companyId, options);

  if (opportunityId !== undefined) {
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

export const assignmentCreatorExportOptions = assignmentListFilters.omit("status");
export const assignmentCreatorsCsv = paginationResultValidator(v.string())
  .omit("page")
  .extend({ csv: v.string(), fileName: v.string() });

/**
 * Exports one sequential CSV page for exactly one company-owned parent.
 * Stable index keys prevent status transitions from moving rows across cursors.
 * Each page reads current profiles; the full export is not a historical snapshot.
 */
export async function exportAssignmentCreatorsCsv(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: Infer<typeof assignmentCreatorExportOptions>,
): Promise<Infer<typeof assignmentCreatorsCsv>> {
  const { opportunityId, campaignId, paginationOpts } = options;
  if ((opportunityId === undefined) === (campaignId === undefined)) {
    throw apiError("invalid_state", { reason: "exactly_one_export_scope_required" });
  }
  if (
    !Number.isInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > 100
  ) {
    throw apiError("invalid_state", { reason: "invalid_page_size" });
  }
  // Export clients follow continueCursor; reactive endCursor ranges could
  // expand beyond the bounded page before creator profiles are hydrated.
  if (paginationOpts.endCursor != null) {
    throw apiError("invalid_state", { reason: "unsupported_end_cursor" });
  }
  await requireAssignmentParents(ctx, companyId, options);

  const query =
    opportunityId !== undefined
      ? ctx.db
          .query("assignments")
          .withIndex("by_opportunityId_and_creatorId", (q) => q.eq("opportunityId", opportunityId))
      : ctx.db
          .query("assignments")
          .withIndex("by_campaignId", (q) => q.eq("campaignId", campaignId!));
  const { page, ...pagination } = await query.order("asc").paginate(paginationOpts);
  // Fail closed if a legacy row's denormalized owner disagrees with its parent.
  if (page.some((assignment) => assignment.companyId !== companyId)) {
    throw apiError("not_found", { resource: "assignment" });
  }

  const rows = await Promise.all(
    page.map(async (assignment) => {
      const creator = await ctx.db.get("creators", assignment.creatorId);
      const user = creator && (await ctx.db.get("users", creator.userId));
      let name = "";
      let email = "";
      // Keep the assignment in the roster without exporting deleted/unavailable PII.
      if (user !== null && user.isActive && user.role === "creator") {
        name =
          [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ") ||
          user.name?.trim() ||
          user.email;
        email = user.email;
      }
      return (
        [
          assignment._id,
          assignment.campaignId,
          assignment.opportunityId,
          assignment.status,
          name,
          email,
        ]
          .map(toCsvCell)
          .join(",") + "\r\n"
      );
    }),
  );
  const header =
    paginationOpts.cursor === null
      ? "assignmentId,campaignId,opportunityId,status,name,email\r\n"
      : "";
  return {
    ...pagination,
    csv: header + rows.join(""),
    fileName:
      opportunityId !== undefined
        ? `opportunity-${opportunityId}-creators.csv`
        : `campaign-${campaignId}-creators.csv`,
  };
}

/** Quote every cell and treat formula-like values as text when opened in spreadsheets. */
function toCsvCell(value: string): string {
  // https://owasp.org/www-community/attacks/CSV_Injection
  const text = /^\s*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
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
