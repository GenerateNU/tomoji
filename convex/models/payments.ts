import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { hasOpenDispute } from "./disputes";

/**
 * Attempts to collect approved payouts by charging the company's card on the
 * creator's Stripe account. Each attempt moves its payout's `paymentStatus`:
 * `processing` while Stripe charges, then `transferred` or `needsAttention`.
 * Webhook outcomes name the attempt by the `paymentId` Tomoji put in the
 * charge's metadata; they are otherwise untrusted.
 */

/** What Stripe reported about an attempt, from a verified webhook. */
type StripeOutcome = { paymentId: string; stripeAccountId: string };

/**
 * Starts the next attempt to collect an approved payout and marks the payout
 * `processing`. The attempt number keys the Stripe charge, so a retry is a
 * new charge and an attempt can never charge twice.
 *
 * @throws `not_found` if the payout does not exist.
 * @throws `invalid_state` with reason `payout_not_approved`, `payout_already_paid`,
 * `payment_in_progress`, or `payout_disputed` when the payout cannot be charged now.
 */
export async function startPayment(
  ctx: MutationCtx,
  payoutId: Id<"payouts">,
  stripeAccountId: string,
): Promise<Doc<"payments">> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null) throw apiError("not_found", { resource: "payout" });
  if (payout.approvalStatus !== "approved") {
    throw apiError("invalid_state", { reason: "payout_not_approved" });
  }
  if (payout.paymentStatus === "transferred") {
    throw apiError("invalid_state", { reason: "payout_already_paid" });
  }
  if (payout.paymentStatus === "processing") {
    throw apiError("invalid_state", { reason: "payment_in_progress" });
  }
  // Approval can precede a dispute, which must still stop the money moving.
  if (await hasOpenDispute(ctx, payout.assignmentId)) {
    throw apiError("invalid_state", { reason: "payout_disputed" });
  }
  const latest = await ctx.db
    .query("payments")
    .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
    .order("desc")
    .first();
  const id = await ctx.db.insert("payments", {
    payoutId,
    attempt: (latest?.attempt ?? 0) + 1,
    stripeAccountId,
    status: "processing",
  });
  await ctx.db.patch("payouts", payoutId, { paymentStatus: "processing" });
  const payment = await ctx.db.get("payments", id);
  if (payment === null) throw new Error("inserted payment vanished");
  return payment;
}

/** Saves the id of the charge Stripe created for an attempt. */
export async function attachPaymentIntent(
  ctx: MutationCtx,
  paymentId: Id<"payments">,
  stripePaymentIntentId: string,
): Promise<void> {
  await ctx.db.patch("payments", paymentId, { stripePaymentIntentId });
}

/**
 * The attempt a webhook names, or null if it is not ours: another deployment's
 * id, or a charge on a different account than the one this attempt charged.
 */
async function getOwnPayment(
  ctx: MutationCtx,
  outcome: StripeOutcome,
): Promise<Doc<"payments"> | null> {
  const id = ctx.db.normalizeId("payments", outcome.paymentId);
  if (id === null) return null;
  const payment = await ctx.db.get("payments", id);
  if (payment === null || payment.stripeAccountId !== outcome.stripeAccountId) return null;
  return payment;
}

/**
 * Applies `payment_intent.succeeded`: the money reached the creator's Stripe
 * balance. Only a `processing` attempt changes, so a repeat, or a success for
 * an attempt already marked failed, is `unchanged`.
 */
export async function recordPaymentSucceeded(
  ctx: MutationCtx,
  outcome: StripeOutcome & {
    stripePaymentIntentId: string;
    succeededAt: number;
  },
): Promise<"updated" | "unchanged" | "unknown"> {
  const payment = await getOwnPayment(ctx, outcome);
  if (payment === null) return "unknown";
  if (payment.status !== "processing") return "unchanged";
  await ctx.db.patch("payments", payment._id, {
    status: "succeeded",
    stripePaymentIntentId: outcome.stripePaymentIntentId,
  });
  await ctx.db.patch("payouts", payment.payoutId, {
    paymentStatus: "transferred",
    transferredAt: outcome.succeededAt,
  });
  return "updated";
}

/**
 * Applies `payment_intent.payment_failed`. The payout stays owed and needs
 * attention; recovering it starts a new attempt. Only a `processing` attempt
 * changes, so a late failure can never undo a success.
 */
export async function recordPaymentFailed(
  ctx: MutationCtx,
  outcome: StripeOutcome & {
    stripePaymentIntentId: string;
    failureCode: string;
  },
): Promise<"updated" | "unchanged" | "unknown"> {
  const payment = await getOwnPayment(ctx, outcome);
  if (payment === null) return "unknown";
  if (payment.status !== "processing") return "unchanged";
  await ctx.db.patch("payments", payment._id, {
    status: "failed",
    stripePaymentIntentId: outcome.stripePaymentIntentId,
    failureCode: outcome.failureCode,
  });
  await ctx.db.patch("payouts", payment.payoutId, {
    paymentStatus: "needsAttention",
  });
  return "updated";
}

/**
 * Records Stripe's fee and the creator's net, which Stripe attaches to the
 * charge a few seconds after it succeeds, possibly before the success event
 * is processed. The first values recorded are kept.
 */
export async function recordPaymentFee(
  ctx: MutationCtx,
  outcome: StripeOutcome & {
    stripeFee: number;
    creatorNet: number;
    settlementCurrency: string;
  },
): Promise<"updated" | "unchanged" | "unknown"> {
  const payment = await getOwnPayment(ctx, outcome);
  if (payment === null) return "unknown";
  if (payment.stripeFee !== undefined) return "unchanged";
  await ctx.db.patch("payments", payment._id, {
    stripeFee: outcome.stripeFee,
    creatorNet: outcome.creatorNet,
    settlementCurrency: outcome.settlementCurrency,
  });
  return "updated";
}
