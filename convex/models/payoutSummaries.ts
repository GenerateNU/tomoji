import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

// Bounds each read so one creator's history stays within a query's limits.
// Past it, the creator sees their most recent payouts and `isPartial` is set.
// Periods also read each paid payout's charges, so they get a smaller budget.
const MAX_SUMMARY_PAYOUTS = 2_000;
const MAX_PERIOD_PAYOUTS = 500;
const TOP_POSTS = 6;

/**
 * Start times in the caller's timezone, since "this month" depends on it.
 * `from: null` means all time. `previousFrom` starts the period that ends at
 * `from`, which the percentage change compares against.
 */
export const payoutSummaryRange = v.object({
  from: v.union(v.number(), v.null()),
  previousFrom: v.union(v.number(), v.null()),
});
export type PayoutSummaryRange = Infer<typeof payoutSummaryRange>;

// Amounts are in the payout's minor units. Every payout is in USD for now, so
// they add up without conversion.
export const payoutSummary = v.object({
  total: v.number(),
  previousTotal: v.union(v.number(), v.null()),
  // Oldest first.
  earnings: v.array(v.object({ at: v.number(), amount: v.number() })),
  topPosts: v.array(
    v.object({
      postId: v.id("posts"),
      // Null once the post has been deleted.
      url: v.union(v.string(), v.null()),
      amount: v.number(),
      previousAmount: v.union(v.number(), v.null()),
    }),
  ),
  isPartial: v.boolean(),
});
export type PayoutSummary = Infer<typeof payoutSummary>;

/**
 * What the creator earned since `range.from`, by when each payout was
 * finalized (`reviewRequestedAt`), and the posts that earned the most.
 */
export async function getPayoutSummary(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  { from, previousFrom }: PayoutSummaryRange,
): Promise<PayoutSummary> {
  if (previousFrom !== null && (from === null || previousFrom >= from)) {
    throw apiError("invalid_state", { reason: "summary_range_invalid" });
  }
  const since = previousFrom ?? from;
  const rows = await ctx.db
    .query("payouts")
    .withIndex("by_creatorId_and_reviewRequestedAt", (q) =>
      since === null
        ? q.eq("creatorId", creatorId)
        : q.eq("creatorId", creatorId).gte("reviewRequestedAt", since),
    )
    .order("desc")
    .take(MAX_SUMMARY_PAYOUTS + 1);
  const payouts = rows.slice(0, MAX_SUMMARY_PAYOUTS);
  const isCurrent = (payout: Doc<"payouts">) => from === null || payout.reviewRequestedAt >= from;

  let total = 0;
  let previousTotal = 0;
  const byPost = new Map<Id<"posts">, { amount: number; previousAmount: number }>();
  for (const payout of payouts) {
    const post = byPost.get(payout.postId) ?? { amount: 0, previousAmount: 0 };
    if (isCurrent(payout)) {
      total += payout.amount;
      post.amount += payout.amount;
    } else {
      previousTotal += payout.amount;
      post.previousAmount += payout.amount;
    }
    byPost.set(payout.postId, post);
  }

  const ranked = [...byPost.entries()]
    .filter(([, post]) => post.amount > 0)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, TOP_POSTS);
  const topPosts = await Promise.all(
    ranked.map(async ([postId, post]) => ({
      postId,
      url: (await ctx.db.get("posts", postId))?.url ?? null,
      amount: post.amount,
      previousAmount: previousFrom === null ? null : post.previousAmount,
    })),
  );

  return {
    total,
    previousTotal: previousFrom === null ? null : previousTotal,
    earnings: payouts
      .filter(isCurrent)
      .map((payout) => ({ at: payout.reviewRequestedAt, amount: payout.amount }))
      .reverse(),
    topPosts,
    isPartial: rows.length > MAX_SUMMARY_PAYOUTS,
  };
}

export const payoutPeriod = v.object({
  // Null for a payout without one, such as a fixed fee, which is its own row.
  earningPeriod: v.union(v.object({ startsAt: v.number(), endsAt: v.number() }), v.null()),
  // When the latest payout in the row was finalized.
  earnedAt: v.number(),
  postCount: v.number(),
  amount: v.number(),
  // The part already transferred to the creator's Stripe balance.
  cleared: v.number(),
  // The last approval, once every payout in the row is approved.
  approvedAt: v.union(v.number(), v.null()),
  // Stripe's fee and what the creator kept, per settlement currency. A
  // creator outside the US is paid in their own currency.
  settlements: v.array(
    v.object({ currency: v.string(), stripeFee: v.number(), creatorNet: v.number() }),
  ),
});
export type PayoutPeriod = Infer<typeof payoutPeriod>;

export const payoutPeriods = v.object({
  periods: v.array(payoutPeriod),
  isPartial: v.boolean(),
});

/** The creator's payouts grouped by earning period, newest first. */
export async function listPayoutPeriods(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
): Promise<Infer<typeof payoutPeriods>> {
  const rows = await ctx.db
    .query("payouts")
    .withIndex("by_creatorId_and_reviewRequestedAt", (q) => q.eq("creatorId", creatorId))
    .order("desc")
    .take(MAX_PERIOD_PAYOUTS + 1);
  const payouts = rows.slice(0, MAX_PERIOD_PAYOUTS);

  const groups = new Map<string, Doc<"payouts">[]>();
  for (const payout of payouts) {
    const key = payout.earningPeriod
      ? `${payout.earningPeriod.startsAt}-${payout.earningPeriod.endsAt}`
      : payout._id;
    groups.set(key, [...(groups.get(key) ?? []), payout]);
  }

  const periods = await Promise.all(
    [...groups.values()].map(async (group): Promise<PayoutPeriod> => {
      const approvals = group.map((payout) => payout.approvedAt);
      const settlements = new Map<string, { stripeFee: number; creatorNet: number }>();
      for (const payout of group) {
        if (payout.paymentStatus !== "transferred") continue;
        for (const charge of await paidCharges(ctx, payout._id)) {
          const settlement = settlements.get(charge.currency) ?? { stripeFee: 0, creatorNet: 0 };
          settlement.stripeFee += charge.stripeFee;
          settlement.creatorNet += charge.creatorNet;
          settlements.set(charge.currency, settlement);
        }
      }
      return {
        earningPeriod: group[0].earningPeriod ?? null,
        earnedAt: Math.max(...group.map((payout) => payout.reviewRequestedAt)),
        postCount: new Set(group.map((payout) => payout.postId)).size,
        amount: sum(group.map((payout) => payout.amount)),
        cleared: sum(
          group.filter((payout) => payout.paymentStatus === "transferred").map((p) => p.amount),
        ),
        approvedAt: approvals.every((at) => at !== undefined) ? Math.max(...approvals) : null,
        settlements: [...settlements.entries()].map(([currency, settlement]) => ({
          currency,
          ...settlement,
        })),
      };
    }),
  );

  const sortKey = (period: PayoutPeriod) => period.earningPeriod?.startsAt ?? period.earnedAt;
  periods.sort((a, b) => sortKey(b) - sortKey(a));
  return { periods, isPartial: rows.length > MAX_PERIOD_PAYOUTS };
}

/**
 * The succeeded charges on a payout whose fee Stripe has reported. Usually one;
 * a payout charged twice has two, and the creator kept both.
 */
async function paidCharges(ctx: QueryCtx, payoutId: Id<"payouts">) {
  const attempts = await ctx.db
    .query("payments")
    .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
    .take(20);
  return attempts.flatMap((attempt) =>
    attempt.status === "succeeded" &&
    attempt.stripeFee !== undefined &&
    attempt.creatorNet !== undefined &&
    attempt.settlementCurrency !== undefined
      ? [
          {
            currency: attempt.settlementCurrency,
            stripeFee: attempt.stripeFee,
            creatorNet: attempt.creatorNet,
          },
        ]
      : [],
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
