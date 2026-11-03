import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authedQuery, requireCallerViewer } from "./lib/functions";
import { listPayouts, payoutListFilters, payoutView, requirePayout } from "./models/payouts";

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
