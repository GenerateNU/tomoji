import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";

/** The company-supplied fields of a deliverable. */
export const deliverableCreate = schema.doc("deliverables").pick("title", "description");
export type DeliverableCreate = Infer<typeof deliverableCreate>;

/** Most deliverables one opportunity can have, so every read of them is bounded. */
export const MAX_DELIVERABLES = 20;

const MAX_LENGTH = { title: 200, description: 5000 } as const;

/**
 * Returns the fields trimmed. Reasons are prefixed (`deliverableTitle_blank`)
 * so they can't be mistaken for the opportunity's own title when a brief is
 * created with its deliverables.
 */
export function normalizeDeliverable(fields: DeliverableCreate): DeliverableCreate {
  return {
    title: requireNonBlank(fields.title, "deliverableTitle", MAX_LENGTH.title),
    description: requireNonBlank(
      fields.description,
      "deliverableDescription",
      MAX_LENGTH.description,
    ),
  };
}

/** An opportunity's deliverables, in the order they were added. */
export async function listOpportunityDeliverables(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"deliverables">[]> {
  return await ctx.db
    .query("deliverables")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(MAX_DELIVERABLES);
}

export async function hasDeliverables(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  const first = await ctx.db
    .query("deliverables")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .first();
  return first !== null;
}

/**
 * Validates and inserts deliverables after the opportunity's `existingCount`.
 * Callers check ownership and whether the deliverables may still change.
 *
 * @throws `invalid_state` with reason `too_many_deliverables`, or a field reason
 * from `normalizeDeliverable`.
 */
export async function insertDeliverables(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  createdBy: Id<"companyUsers">,
  drafts: DeliverableCreate[],
  existingCount: number,
): Promise<Id<"deliverables">[]> {
  if (existingCount + drafts.length > MAX_DELIVERABLES) {
    throw apiError("invalid_state", { reason: "too_many_deliverables" });
  }
  const ids: Id<"deliverables">[] = [];
  for (const draft of drafts) {
    const row = { ...normalizeDeliverable(draft), opportunityId, createdBy };
    ids.push(await ctx.db.insert("deliverables", row));
  }
  return ids;
}
