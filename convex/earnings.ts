import { internalMutation } from "./_generated/server";
import { paginationResultValidator } from "convex/server";
import { authedQuery, requireCallerViewer } from "./lib/functions";
import { earningSettlement, earningSettlementResult, settleEarnings } from "./models/earnings";
import {
  earningsLookup,
  earningsDetailView,
  earningsHistoryArgs,
  earningCalculationView,
  requireEarningsDetails,
  listEarningCalculations,
} from "./models/earningsHistory";

/** Reads agreed terms and stored timing; missing or foreign agreements return not_found. */
export const get = authedQuery({
  args: earningsLookup.fields,
  returns: earningsDetailView,
  handler: async (ctx, args) =>
    await requireEarningsDetails(ctx, await requireCallerViewer(ctx, ctx.user), args),
});

/** Newest period first, including pending/covered records. Reads never settle earnings. */
export const listCalculations = authedQuery({
  args: earningsHistoryArgs.fields,
  returns: paginationResultValidator(earningCalculationView),
  handler: async (ctx, args) =>
    await listEarningCalculations(ctx, await requireCallerViewer(ctx, ctx.user), args),
});

/** Calculates and records one due earning period using the same model as the scheduler. */
export const settle = internalMutation({
  args: earningSettlement.fields,
  returns: earningSettlementResult,
  handler: async (ctx, args) => await settleEarnings(ctx, args),
});
