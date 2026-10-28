import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { authedQuery, companyAdminMutation, requireCallerViewer } from "./lib/functions";
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
} from "./models/payouts";
import schema from "./schema";

/**
 * Records a finalized earning from trusted backend code and starts a 72-hour
 * review window. Same-source retries return the existing payout; conflicting
 * earning details throw `conflict`. No approval or payment is scheduled here.
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
 * Foreign scopes return no rows. Historical parents need not still exist.
 *
 * Uses native cursor pagination; a scan-limited page may be short or empty while
 * `isDone` is false. Continue with `continueCursor` and the same filters.
 */
export const list = authedQuery({
  args: payoutListFilters.fields,
  returns: paginationResultValidator(payoutView),
  handler: async (ctx, args) => {
    return await listPayouts(ctx, await requireCallerViewer(ctx, ctx.user), args);
  },
});
