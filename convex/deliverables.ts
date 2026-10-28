import { v } from "convex/values";
import { authedQuery, companyMutation } from "./lib/functions";
import { findOrgId } from "./lib/identity";
import { deliverableCreate } from "./models/deliverableDrafts";
import {
  createDeliverable,
  deliverableUpdate,
  deliverableView,
  listDeliverables,
  removeDeliverable,
  updateDeliverable,
} from "./models/deliverables";
import schema from "./schema";

/**
 * Adds a deliverable to an opportunity owned by the caller's company. Any
 * company user in that company can. Text is stored trimmed.
 *
 * @throws `not_found` if the opportunity doesn't exist or isn't the company's.
 * @throws `invalid_state` if the opportunity or its campaign is closed
 * (`opportunity_not_editable`), it already has the most deliverables allowed
 * (`too_many_deliverables`), or the title or description is blank or too long
 * (`deliverableTitle_blank`, `deliverableDescription_too_long`, …).
 * @returns the new deliverable's id.
 */
export const create = companyMutation({
  args: { opportunityId: v.id("opportunities"), ...deliverableCreate.fields },
  returns: v.id("deliverables"),
  handler: async (ctx, { opportunityId, ...fields }) => {
    return await createDeliverable(ctx, ctx.membership, opportunityId, fields);
  },
});

/**
 * Edits a deliverable's title or description. Omitted fields stay unchanged.
 *
 * @throws `not_found` if the deliverable doesn't exist or isn't the company's.
 * @throws `invalid_state` if the opportunity or its campaign is closed
 * (`opportunity_not_editable`), a creator has been assigned
 * (`opportunity_has_assignments`), or the title or description is blank or too long.
 * @returns the updated deliverable.
 */
export const update = companyMutation({
  args: { deliverableId: v.id("deliverables"), ...deliverableUpdate.fields },
  returns: schema.doc("deliverables"),
  handler: async (ctx, { deliverableId, ...updates }) => {
    return await updateDeliverable(ctx, ctx.membership, deliverableId, updates);
  },
});

/**
 * Deletes a deliverable. A published opportunity must keep at least one.
 *
 * @throws `not_found` if the deliverable doesn't exist or isn't the company's.
 * @throws `invalid_state` if the opportunity or its campaign is closed, or a
 * creator has been assigned (as in `update`), or it's the last one on a
 * published opportunity (`last_deliverable`).
 */
export const remove = companyMutation({
  args: { deliverableId: v.id("deliverables") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeDeliverable(ctx, ctx.membership, args.deliverableId);
    return null;
  },
});

/**
 * Lists an opportunity's deliverables in the order they were added. Its company
 * and operators get the stored rows. Creators get them without `createdBy`, for
 * an opportunity they can discover or one they've been assigned to.
 *
 * @throws `not_found` if the opportunity doesn't exist or the caller can't see it.
 */
export const list = authedQuery({
  args: { opportunityId: v.id("opportunities") },
  returns: v.array(deliverableView),
  handler: async (ctx, args) => {
    return await listDeliverables(
      ctx,
      { user: ctx.user, orgId: findOrgId(ctx.identity) },
      args.opportunityId,
    );
  },
});
