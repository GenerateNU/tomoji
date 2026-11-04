import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authedQuery, requireCallerViewer } from "./lib/functions";
import {
  createPayout,
  listPayouts,
  payoutCreate,
  payoutListFilters,
  payoutView,
  requirePayout,
} from "./models/payouts";
import schema from "./schema";

/**
 * Records a finalized earning from trusted backend code and starts a 72-hour
 * review window. The earnings caller supplies a stable sourceKey for the earning
 * event and reuses it on retries; this route does not generate keys. Same-source
 * retries return the existing payout; conflicting earning details throw `conflict`.
 * No approval or payment is scheduled here.
 */
export const create = internalMutation({
  args: payoutCreate.fields,
  returns: schema.doc("payouts"),
  handler: async (ctx, args) => await createPayout(ctx, args),
});

/**
 * Gets one payout: creators see their own, company users see their company's,
 * and operators see all. Internal source keys and approval actor IDs are omitted.
 *
 * @throws `not_found` if the payout is missing or belongs to another owner.
 */
export const get = authedQuery({
  args: { payoutId: v.id("payouts") },
  returns: payoutView,
  handler: async (ctx, args) => {
    return await requirePayout(ctx, await requireCallerViewer(ctx, ctx.user), args.payoutId);
  },
});

/**
 * Lists visible payouts newest review request first, with optional assignment,
 * campaign, and approval-status filters. Assignment and campaign may be combined.
 * Company callers cannot filter by an existing campaign or assignment owned by
 * another company. Missing parents still allow reads of historical payouts.
 * Creator and operator filters use the payout's stored ownership.
 *
 * Uses native cursor pagination; a scan-limited page may be short or empty while
 * `isDone` is false. Continue with `continueCursor` and the same filters.
 *
 * @throws `not_found` for a company caller filtering by another company's existing parent.
 */
export const list = authedQuery({
  args: payoutListFilters.fields,
  returns: paginationResultValidator(payoutView),
  handler: async (ctx, args) => {
    return await listPayouts(ctx, await requireCallerViewer(ctx, ctx.user), args);
  },
});
