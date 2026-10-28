import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import schema from "../schema";
import {
  deliverableCreate,
  insertDeliverables,
  listOpportunityDeliverables,
  normalizeDeliverable,
  type DeliverableCreate,
} from "./deliverableDrafts";
import { requireEditableOpportunity, requireOpportunity } from "./opportunities";
import { requireCallerCreatorId } from "./users";

export const deliverableUpdate = deliverableCreate.partial();
export type DeliverableUpdate = Infer<typeof deliverableUpdate>;

// Allowlist creator fields so new stored fields do not become visible to creators by default.
export const creatorDeliverable = schema
  .doc("deliverables")
  .pick("_id", "_creationTime", "opportunityId", "title", "description");
export type CreatorDeliverable = Infer<typeof creatorDeliverable>;

/** What `list` returns: the stored row, or the creator view without who created it. */
export const deliverableView = v.union(schema.doc("deliverables"), creatorDeliverable);

function toCreatorDeliverable(deliverable: Doc<"deliverables">): CreatorDeliverable {
  return {
    _id: deliverable._id,
    _creationTime: deliverable._creationTime,
    opportunityId: deliverable.opportunityId,
    title: deliverable.title,
    description: deliverable.description,
  };
}

/** Whether any creator has ever been assigned, whatever the assignment's status now. */
async function hasAssignments(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  const first = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_creatorId", (q) => q.eq("opportunityId", opportunityId))
    .first();
  return first !== null;
}

/**
 * Deliverables can't be removed once a creator has been assigned, in any
 * status: their drafts point at these deliverables. New ones can still be
 * added and wording can still change, like the opportunity's brief.
 */
async function requireNoAssignments(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  if (await hasAssignments(ctx, opportunityId)) {
    throw apiError("invalid_state", { reason: "opportunity_has_assignments" });
  }
}

/**
 * The deliverable and its opportunity, if its opportunity is editable (not closed or expired). Throws
 * `not_found` for another company's deliverable, the same as a missing one.
 */
async function requireEditableDeliverable(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  deliverableId: Id<"deliverables">,
): Promise<{
  deliverable: Doc<"deliverables">;
  opportunity: Doc<"opportunities">;
}> {
  const deliverable = await ctx.db.get("deliverables", deliverableId);
  const owner = deliverable && (await ctx.db.get("opportunities", deliverable.opportunityId));
  if (!deliverable || !owner || owner.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "deliverable" });
  }
  const { opportunity } = await requireEditableOpportunity(ctx, membership, owner._id);
  return { deliverable, opportunity };
}

/** Adds a deliverable to an owned opportunity. Errors are listed on the `deliverables.create` route. */
export async function createDeliverable(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
  fields: DeliverableCreate,
): Promise<Id<"deliverables">> {
  await requireEditableOpportunity(ctx, membership, opportunityId);
  const existing = await listOpportunityDeliverables(ctx, opportunityId);
  const [deliverableId] = await insertDeliverables(
    ctx,
    opportunityId,
    membership._id,
    [fields],
    existing.length,
  );
  return deliverableId;
}

/** Edits a deliverable's text. Errors are listed on the `deliverables.update` route. */
export async function updateDeliverable(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  deliverableId: Id<"deliverables">,
  updates: DeliverableUpdate,
): Promise<Doc<"deliverables">> {
  const { deliverable } = await requireEditableDeliverable(ctx, membership, deliverableId);
  const patch = normalizeDeliverable({
    title: updates.title ?? deliverable.title,
    description: updates.description ?? deliverable.description,
  });
  await ctx.db.patch("deliverables", deliverableId, patch);
  return { ...deliverable, ...patch };
}

/** Deletes a deliverable. Errors are listed on the `deliverables.remove` route. */
export async function removeDeliverable(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  deliverableId: Id<"deliverables">,
): Promise<void> {
  const { opportunity } = await requireEditableDeliverable(ctx, membership, deliverableId);
  await requireNoAssignments(ctx, opportunity._id);
  // Publishing needs a deliverable, so a published opportunity always keeps one.
  if (opportunity.status !== "draft") {
    const remaining = await listOpportunityDeliverables(ctx, opportunity._id);
    if (remaining.length <= 1) {
      throw apiError("invalid_state", { reason: "last_deliverable" });
    }
  }
  await ctx.db.delete("deliverables", deliverableId);
}

/** An opportunity's deliverables as the caller may see them. Rules are listed on the `deliverables.list` route. */
export async function listDeliverables(
  ctx: QueryCtx,
  caller: { user: Doc<"users">; orgId: string | null },
  opportunityId: Id<"opportunities">,
): Promise<Doc<"deliverables">[] | CreatorDeliverable[]> {
  if (caller.user.role !== "creator") {
    await requireOpportunity(ctx, opportunityId, caller);
    return await listOpportunityDeliverables(ctx, opportunityId);
  }

  const creatorId = await requireCallerCreatorId(ctx, caller.user);
  const assignment = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", opportunityId).eq("creatorId", creatorId),
    )
    .first();
  if (assignment === null) await requireOpportunity(ctx, opportunityId, caller);
  const deliverables = await listOpportunityDeliverables(ctx, opportunityId);
  return deliverables.map(toCreatorDeliverable);
}
