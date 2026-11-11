import { internalMutation } from "./_generated/server";
import { earningSettlement, earningSettlementResult, settleEarnings } from "./models/earnings";

/** Calculates and records one due earning period. Scheduling belongs to the next PR. */
export const settle = internalMutation({
  args: earningSettlement.fields,
  returns: earningSettlementResult,
  handler: async (ctx, args) => await settleEarnings(ctx, args),
});
