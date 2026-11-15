import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  authedQuery,
  companyAdminMutation,
  companyContext,
  creatorQuery,
  requireCallerViewer,
} from "./lib/functions";
import {
  approvePayout,
  autoApprovePayouts,
  createPayout,
  listPayouts,
  payoutApprovalContinuation,
  payoutCreate,
  payoutListFilters,
  payoutView,
  requirePayout,
  type PayoutApprovalContinuation,
  type PayoutViewer,
} from "./models/payouts";
import {
  getPayoutSummary,
  listPayoutPeriods,
  payoutPeriods,
  payoutSummary,
  payoutSummaryRange,
} from "./models/payoutSummaries";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/** Resolve ownership and approval authority from the caller's current membership. */
async function requirePayoutViewer(ctx: QueryCtx, user: Doc<"users">): Promise<PayoutViewer> {
  if (user.role !== "company") return await requireCallerViewer(ctx, user);
  const { membership } = await companyContext(ctx);
  return { role: "company", companyId: membership.companyId, companyRole: membership.role };
}

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
 * Approves a payout belonging to the caller's company. Company admins only.
 * An open assignment dispute blocks new approval. Repeated approval preserves
 * the original actor and time. Approval does not start a payment.
 *
 * @throws `not_found` for a missing or foreign payout.
 * @throws `invalid_state` with `payout_disputed` while an assignment dispute is open.
 */
export const approve = companyAdminMutation({
  args: { payoutId: v.id("payouts") },
  returns: payoutView,
  handler: async (ctx, { payoutId }) => await approvePayout(ctx, ctx.membership, payoutId),
});

/**
 * Approves overdue, undisputed payouts in bounded pages. Continuations keep the
 * original cutoff and advance past disputed rows so they cannot stall the sweep.
 */
export const autoApprove = internalMutation({
  args: { continuation: v.optional(payoutApprovalContinuation) },
  returns: v.null(),
  handler: async (ctx, { continuation }) => {
    const next: PayoutApprovalContinuation | null = await autoApprovePayouts(ctx, continuation);
    if (next !== null) {
      await ctx.scheduler.runAfter(0, internal.payouts.autoApprove, { continuation: next });
    }
    return null;
  },
});

/**
 * Gets one payout with its stored deliverable identity and current review context:
 * creators see their own, company users see their company's, and operators see all.
 * Internal source keys and approval actor IDs are omitted. Review eligibility is
 * informational; the approval mutation independently enforces permission and holds.
 *
 * @throws `not_found` if the payout is missing or belongs to another owner.
 */
export const get = authedQuery({
  args: { payoutId: v.id("payouts") },
  returns: payoutView,
  handler: async (ctx, args) => {
    return await requirePayout(ctx, await requirePayoutViewer(ctx, ctx.user), args.payoutId);
  },
});

/**
 * Lists visible payouts newest review request first, with optional assignment,
 * campaign, and approval-status filters. Assignment and campaign may be combined.
 * Company callers cannot filter by an existing campaign or assignment owned by
 * another company. Missing parents still allow reads of historical payouts.
 * Creator and operator filters use the payout's stored ownership.
 * Each row includes current review context without dropping disputed payouts.
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
    return await listPayouts(ctx, await requirePayoutViewer(ctx, ctx.user), args);
  },
});

/**
 * The calling creator's earnings since `from`, for the Earnings page: the
 * total, each payout's amount and time for the chart, and the six posts that
 * earned the most. Pass start times in the creator's timezone; `from: null` is
 * all time. With `previousFrom`, also totals the period from there to `from`,
 * for the percentage change.
 *
 * Reads at most the 2,000 most recent payouts in range; `isPartial` says more exist.
 *
 * @throws `invalid_state` with `summary_range_invalid` if `previousFrom` is
 * given without `from`, or isn't before it.
 */
export const summary = creatorQuery({
  args: payoutSummaryRange.fields,
  returns: payoutSummary,
  handler: async (ctx, args) => {
    return await getPayoutSummary(ctx, await requireCallerCreatorId(ctx, ctx.user), args);
  },
});

/**
 * The calling creator's payout history grouped by earning period, newest first,
 * with what each period earned, what has reached their Stripe balance, Stripe's
 * fee, and when it was approved. A payout without an earning period is its own
 * row. Reads at most the 500 most recent payouts; `isPartial` says more exist.
 */
export const periods = creatorQuery({
  args: {},
  returns: payoutPeriods,
  handler: async (ctx) => {
    return await listPayoutPeriods(ctx, await requireCallerCreatorId(ctx, ctx.user));
  },
});
