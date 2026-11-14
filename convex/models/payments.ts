import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { hasOpenDispute } from "./disputes";
import { getStripeAccountByCreatorId, toStripeAccountStatus } from "./stripeAccounts";
import { getStripeCustomerByCompanyId, isCardExpired } from "./stripeCustomers";

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

async function latestAttempt(
  ctx: QueryCtx | MutationCtx,
  payoutId: Id<"payouts">,
): Promise<Doc<"payments"> | null> {
  return await ctx.db
    .query("payments")
    .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
    .order("desc")
    .first();
}

/**
 * Moves up to `limit` approved, uncharged payouts to `queued`, oldest approval
 * first, and returns them for charging. Once queued a payout is never claimed
 * again, so overlapping runs cannot charge it twice.
 */
export async function claimDuePayouts(ctx: MutationCtx, limit: number): Promise<Id<"payouts">[]> {
  const due = await ctx.db
    .query("payouts")
    .withIndex("by_approvalStatus_and_paymentStatus_and_approvedAt", (q) =>
      q.eq("approvalStatus", "approved").eq("paymentStatus", "notStarted"),
    )
    .take(limit);
  for (const payout of due) {
    await ctx.db.patch("payouts", payout._id, { paymentStatus: "queued" });
  }
  return due.map((payout) => payout._id);
}

/**
 * The Stripe account a payout would be charged on: its creator's current one,
 * or null if they have none.
 */
export async function getChargeAccountId(
  ctx: QueryCtx,
  payoutId: Id<"payouts">,
): Promise<string | null> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null) return null;
  return (await getStripeAccountByCreatorId(ctx, payout.creatorId))?.stripeAccountId ?? null;
}

/** Why a queued payout cannot be charged now. Each is recorded as a failed attempt. */
export type ChargeBlock =
  | "company_card_missing"
  | "company_card_expired"
  | "creator_not_ready"
  | "creator_account_missing"
  | "payout_disputed";

/**
 * What to do with a payout: charge this attempt, nothing, or nothing because it
 * is blocked. A `resumed` attempt may already have charged, so Stripe is asked
 * before anything is sent; if the company's card is no longer usable, the card
 * fields are null and `cardBlock` says why, so the attempt fails only once
 * Stripe confirms there is no charge.
 */
export type ChargePlan =
  | {
      kind: "charge";
      payment: Doc<"payments">;
      resumed: boolean;
      stripeCustomerId: string | null;
      paymentMethodId: string | null;
      cardBlock: ChargeBlock | null;
      amount: number;
      currency: string;
    }
  | { kind: "blocked"; reason: ChargeBlock }
  | { kind: "settled" };

/**
 * Decides how to charge a payout and, for a new charge, starts its attempt.
 * `chargesEnabled` is Stripe's live answer for the creator's account, or null
 * if the creator has none.
 *
 * - A `queued` payout that can be charged starts an attempt (`charge`).
 * - A `processing` attempt whose charge Stripe never confirmed is resumed with
 *   the same attempt, so its idempotency key makes Stripe return the original
 *   charge if there was one.
 * - A payout that cannot be charged now is `blocked`: it records a failed
 *   attempt with the reason and needs attention, leaving the queue so it cannot
 *   hold up other payouts. Recovery decides when to try again.
 * - Anything else, such as a paid payout or a charge awaiting Stripe's
 *   outcome, is `settled`.
 */
export async function prepareCharge(
  ctx: MutationCtx,
  payoutId: Id<"payouts">,
  chargesEnabled: boolean | null,
): Promise<ChargePlan> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null) return { kind: "settled" };
  const latest = await latestAttempt(ctx, payoutId);
  const customer = await getStripeCustomerByCompanyId(ctx, payout.companyId);
  const card = customer?.card;

  if (payout.paymentStatus === "processing") {
    if (
      latest === null ||
      latest.status !== "processing" ||
      latest.stripePaymentIntentId !== undefined
    ) {
      return { kind: "settled" };
    }
    const cardBlock =
      customer === null || card === undefined
        ? "company_card_missing"
        : isCardExpired(card, Date.now())
          ? "company_card_expired"
          : null;
    return {
      kind: "charge",
      payment: latest,
      resumed: true,
      stripeCustomerId: cardBlock === null ? (customer?.stripeCustomerId ?? null) : null,
      paymentMethodId: cardBlock === null ? (card?.paymentMethodId ?? null) : null,
      cardBlock,
      amount: payout.amount,
      currency: payout.currency,
    };
  }

  if (payout.paymentStatus !== "queued" || payout.approvalStatus !== "approved") {
    return { kind: "settled" };
  }
  const account = await getStripeAccountByCreatorId(ctx, payout.creatorId);
  if (account === null) {
    // Applying requires a ready account, so this is a broken invariant. There is
    // no account to record an attempt against, so only the payout is flagged.
    console.error("Payout's creator has no Stripe account", { payoutId });
    await ctx.db.patch("payouts", payoutId, { paymentStatus: "needsAttention" });
    return { kind: "blocked", reason: "creator_account_missing" };
  }
  if (await hasOpenDispute(ctx, payout.assignmentId)) {
    return await blockPayout(ctx, payout, latest, account.stripeAccountId, "payout_disputed");
  }
  if (toStripeAccountStatus(account) !== "ready" || chargesEnabled !== true) {
    return await blockPayout(ctx, payout, latest, account.stripeAccountId, "creator_not_ready");
  }
  if (customer === null || card === undefined) {
    return await blockPayout(ctx, payout, latest, account.stripeAccountId, "company_card_missing");
  }
  // An expired card would only be declined; the company needs to replace it first.
  if (isCardExpired(card, Date.now())) {
    return await blockPayout(ctx, payout, latest, account.stripeAccountId, "company_card_expired");
  }
  return {
    kind: "charge",
    payment: await startPayment(ctx, payoutId, account.stripeAccountId),
    resumed: false,
    stripeCustomerId: customer.stripeCustomerId,
    paymentMethodId: card.paymentMethodId,
    cardBlock: null,
    amount: payout.amount,
    currency: payout.currency,
  };
}

/** Records why a payout cannot be charged as a failed attempt, and flags it. */
async function blockPayout(
  ctx: MutationCtx,
  payout: Doc<"payouts">,
  latest: Doc<"payments"> | null,
  stripeAccountId: string,
  reason: ChargeBlock,
): Promise<ChargePlan> {
  await ctx.db.insert("payments", {
    payoutId: payout._id,
    attempt: (latest?.attempt ?? 0) + 1,
    stripeAccountId,
    status: "failed",
    failureCode: reason,
  });
  await ctx.db.patch("payouts", payout._id, { paymentStatus: "needsAttention" });
  return { kind: "blocked", reason };
}

/**
 * Fails an in-flight attempt once it is certain Stripe made no charge for it:
 * Stripe found none for a resumed attempt, or refused the charge request
 * outright. Only a `processing` attempt changes.
 */
export async function failChargeAttempt(
  ctx: MutationCtx,
  paymentId: Id<"payments">,
  failureCode: string,
): Promise<void> {
  const payment = await ctx.db.get("payments", paymentId);
  if (payment === null || payment.status !== "processing") return;
  await ctx.db.patch("payments", payment._id, { status: "failed", failureCode });
  await ctx.db.patch("payouts", payment.payoutId, { paymentStatus: "needsAttention" });
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
