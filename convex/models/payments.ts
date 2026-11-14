import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { hasOpenDispute } from "./disputes";
import { createNotification, creatorName, notifyCreator, notifyOperators } from "./notifications";
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
    // Recovery's clock starts with the attempt.
    lastCheckedAt: Date.now(),
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
  const now = Date.now();
  for (const payout of due) {
    await ctx.db.patch("payouts", payout._id, { paymentStatus: "queued", queuedAt: now });
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
  | { kind: "check"; payment: Doc<"payments"> }
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
    if (latest === null || latest.status !== "processing") return { kind: "settled" };
    // The charge exists, so it is never made again; Stripe is asked for its outcome.
    if (latest.stripePaymentIntentId !== undefined) return { kind: "check", payment: latest };
    // Resent with the attempt's own card, so the same key carries the same
    // request. Not resent at all once the company has removed its card.
    const usable = customer !== null && card !== undefined && latest.paymentMethodId !== undefined;
    return {
      kind: "charge",
      payment: latest,
      resumed: true,
      stripeCustomerId: usable ? customer.stripeCustomerId : null,
      paymentMethodId: usable ? (latest.paymentMethodId ?? null) : null,
      cardBlock: usable ? null : "company_card_missing",
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
  const started = await startPayment(ctx, payoutId, account.stripeAccountId);
  await ctx.db.patch("payments", started._id, { paymentMethodId: card.paymentMethodId });
  return {
    kind: "charge",
    payment: { ...started, paymentMethodId: card.paymentMethodId },
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
  await notifyPaymentProblem(ctx, payout, reason);
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
  const payout = await ctx.db.get("payouts", payment.payoutId);
  if (payout !== null) await notifyPaymentProblem(ctx, payout, failureCode);
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
  if (payment.status === "succeeded") return "unchanged";
  // A success Stripe confirms is money that moved, even for an attempt already
  // marked failed: ignoring it would leave the payout open to another charge.
  await ctx.db.patch("payments", payment._id, {
    status: "succeeded",
    stripePaymentIntentId: outcome.stripePaymentIntentId,
  });
  const payout = await ctx.db.get("payouts", payment.payoutId);
  if (payout === null) return "updated";
  if (payout.paymentStatus === "transferred") {
    // Another attempt already paid it, so the company was charged twice.
    await notifyOperators(ctx, {
      type: "payoutChargedTwice",
      title: `A ${formatAmount(payout.amount, payout.currency)} payout to ${await creatorName(ctx, payout.creatorId)} was charged twice`,
      body: `Charge ${outcome.stripePaymentIntentId} succeeded after the payout was already paid. Refund one charge.`,
      target: { kind: "assignment", assignmentId: payout.assignmentId },
    });
    return "updated";
  }
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
  const payout = await ctx.db.get("payouts", payment.payoutId);
  if (payout !== null) await notifyPaymentProblem(ctx, payout, outcome.failureCode);
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

/**
 * Who can fix a failed or blocked attempt, by its `failureCode`: the creator
 * (their Stripe account), resolving a dispute, or the company (its card, for
 * every decline Stripe reports and a missing card).
 */
function blockedOn(failureCode: string | undefined): "creator" | "dispute" | "company" {
  if (failureCode === "creator_not_ready" || failureCode === "creator_account_missing") {
    return "creator";
  }
  if (failureCode === "payout_disputed") return "dispute";
  return "company";
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Tells whoever can fix a payout that needs attention, once per failed attempt:
 * the creator to finish their Stripe setup, or the company member who created
 * the campaign about its card. Disputes already notify both sides, and a
 * creator without any account is a broken invariant, so neither notifies here.
 */
// A company has a handful of members; this keeps the read bounded.
const MAX_NOTIFIED_ADMINS = 100;

async function notifyPaymentProblem(
  ctx: MutationCtx,
  payout: Doc<"payouts">,
  failureCode: string,
): Promise<void> {
  if (failureCode === "payout_disputed" || failureCode === "creator_account_missing") return;
  const amount = formatAmount(payout.amount, payout.currency);
  const target = { kind: "assignment" as const, assignmentId: payout.assignmentId };
  if (blockedOn(failureCode) === "creator") {
    await notifyCreator(ctx, payout.creatorId, {
      type: "payoutStripeSetupNeeded",
      title: `A ${amount} payment is waiting for your Stripe setup`,
      body: "Finish setting up Stripe to get paid.",
      target,
    });
    return;
  }
  // Only admins can change the card, so they hear about it, unlike most
  // company notifications, which go to whoever created the campaign.
  const content = {
    type: "payoutPaymentFailed" as const,
    title: `Payment of ${amount} to ${await creatorName(ctx, payout.creatorId)} failed`,
    body:
      failureCode === "company_card_missing"
        ? "Your company has no saved card. Add one in settings to pay creators."
        : `The company card was declined (${failureCode}). Update it in settings.`,
    target,
  };
  const members = await ctx.db
    .query("companyUsers")
    .withIndex("by_companyId", (q) => q.eq("companyId", payout.companyId))
    .take(MAX_NOTIFIED_ADMINS);
  for (const member of members) {
    if (member.isActive && member.role === "admin") {
      await createNotification(ctx, member.userId, content);
    }
  }
}

/**
 * Returns a payout that needs attention to the charging queue; the next run
 * charges it as a new attempt.
 *
 * @throws `not_found` if the payout does not exist.
 * @throws `invalid_state` with reason `payout_not_retryable` unless it needs attention.
 */
export async function retryPayout(ctx: MutationCtx, payoutId: Id<"payouts">): Promise<void> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null) throw apiError("not_found", { resource: "payout" });
  if (payout.paymentStatus !== "needsAttention" || (await wasPaid(ctx, payoutId))) {
    throw apiError("invalid_state", { reason: "payout_not_retryable" });
  }
  await ctx.db.patch("payouts", payoutId, { paymentStatus: "notStarted" });
}

/**
 * Whether any attempt charged the payout. A retry must never follow one, even
 * if the payout's status has not caught up yet.
 */
/**
 * Whether the company won a dispute on the assignment. Its payouts then stay
 * `needsAttention`: whether the creator is still paid is an operator's call.
 * A creator winning, such as over a missing payment, never holds a payout.
 */
async function companyWonDispute(ctx: QueryCtx, assignmentId: Id<"assignments">) {
  const disputes = await ctx.db
    .query("disputes")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .take(100);
  return disputes.some(
    (dispute) =>
      dispute.status === "resolved" &&
      dispute.openedByRole === "company" &&
      dispute.outcome === "approved",
  );
}

async function wasPaid(ctx: QueryCtx, payoutId: Id<"payouts">): Promise<boolean> {
  const attempts = await ctx.db
    .query("payments")
    .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
    .collect();
  return attempts.some((attempt) => attempt.status === "succeeded");
}

/**
 * `retryPayout` for a company admin: only their own company's payouts.
 *
 * @throws `not_found` if the payout is missing or another company's.
 */
export async function retryCompanyPayout(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  payoutId: Id<"payouts">,
): Promise<void> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null || payout.companyId !== companyId) {
    throw apiError("not_found", { resource: "payout" });
  }
  await retryPayout(ctx, payoutId);
}

// A company or creator rarely has this many payouts needing attention at once;
// any beyond it are requeued by the next save, the sweep, or a manual retry.
const REQUEUE_LIMIT = 100;

/** Requeues the company's payouts that failed on its card, after it saves one. Returns how many. */
export async function requeueCompanyPayouts(
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<number> {
  const waiting = await ctx.db
    .query("payouts")
    .withIndex("by_companyId_and_paymentStatus", (q) =>
      q.eq("companyId", companyId).eq("paymentStatus", "needsAttention"),
    )
    .take(REQUEUE_LIMIT);
  return await requeueBlockedOn(ctx, waiting, "company");
}

/** Requeues the creator's payouts that waited on their Stripe account, once it is ready. */
export async function requeueCreatorPayouts(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
): Promise<number> {
  const waiting = await ctx.db
    .query("payouts")
    .withIndex("by_creatorId_and_paymentStatus", (q) =>
      q.eq("creatorId", creatorId).eq("paymentStatus", "needsAttention"),
    )
    .take(REQUEUE_LIMIT);
  return await requeueBlockedOn(ctx, waiting, "creator");
}

async function requeueBlockedOn(
  ctx: MutationCtx,
  payouts: Doc<"payouts">[],
  party: "creator" | "company",
): Promise<number> {
  let requeued = 0;
  for (const payout of payouts) {
    const latest = await latestAttempt(ctx, payout._id);
    if (blockedOn(latest?.failureCode) !== party || (await wasPaid(ctx, payout._id))) continue;
    await ctx.db.patch("payouts", payout._id, { paymentStatus: "notStarted" });
    requeued += 1;
  }
  return requeued;
}

/**
 * Requeues payouts held by a dispute that has since closed, a page at a time.
 * Returns the cursor to continue with, or null when done.
 */
export async function requeueResolvedDisputes(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<{ requeued: number; continueCursor: string | null }> {
  const page = await ctx.db
    .query("payouts")
    .withIndex("by_approvalStatus_and_paymentStatus_and_approvedAt", (q) =>
      q.eq("approvalStatus", "approved").eq("paymentStatus", "needsAttention"),
    )
    .paginate({ cursor, numItems: 50 });
  let requeued = 0;
  for (const payout of page.page) {
    const latest = await latestAttempt(ctx, payout._id);
    if (blockedOn(latest?.failureCode) !== "dispute") continue;
    if (
      (await hasOpenDispute(ctx, payout.assignmentId)) ||
      (await companyWonDispute(ctx, payout.assignmentId)) ||
      (await wasPaid(ctx, payout._id))
    ) {
      continue;
    }
    await ctx.db.patch("payouts", payout._id, { paymentStatus: "notStarted" });
    requeued += 1;
  }
  return { requeued, continueCursor: page.isDone ? null : page.continueCursor };
}

/**
 * Claims payouts whose charging stalled before `cutoff` (Unix ms): still
 * `queued` long after charging claimed them, because their scheduled charge was
 * lost, or `processing` with an attempt that hasn't settled since it was last
 * checked. Charging them again is safe: it resumes the same attempt and key, or
 * asks Stripe for the outcome of an existing charge. Claiming restarts each
 * one's clock, so attempts that never settle take turns with newer stalls
 * instead of filling every batch.
 */
export async function claimStalePayouts(
  ctx: MutationCtx,
  cutoff: number,
  limit: number,
): Promise<Id<"payouts">[]> {
  const now = Date.now();
  const queued = await ctx.db
    .query("payouts")
    .withIndex("by_paymentStatus_and_queuedAt", (q) =>
      q.eq("paymentStatus", "queued").lt("queuedAt", cutoff),
    )
    .take(limit);
  const processing = await ctx.db
    .query("payments")
    .withIndex("by_status_and_lastCheckedAt", (q) =>
      q.eq("status", "processing").lt("lastCheckedAt", cutoff),
    )
    .take(limit);
  const claimed: Id<"payouts">[] = [];
  for (const payout of queued) {
    claimed.push(payout._id);
    await ctx.db.patch("payouts", payout._id, { queuedAt: now });
  }
  for (const attempt of processing) {
    if (claimed.length >= limit) break;
    if (!claimed.includes(attempt.payoutId)) claimed.push(attempt.payoutId);
    await ctx.db.patch("payments", attempt._id, { lastCheckedAt: now });
  }
  return claimed;
}

/** A charge reversed outside Tomoji, named by the creator account and charge Stripe reports. */
type ChargeReversal = { stripeAccountId: string; stripePaymentIntentId: string };

/** The successful attempt behind a charge, or null if this deployment did not make it. */
async function getChargedPayment(
  ctx: MutationCtx,
  reversal: ChargeReversal,
): Promise<{ payment: Doc<"payments">; payout: Doc<"payouts"> } | null> {
  const payment = await ctx.db
    .query("payments")
    .withIndex("by_stripePaymentIntentId", (q) =>
      q.eq("stripePaymentIntentId", reversal.stripePaymentIntentId),
    )
    .unique();
  if (payment === null || payment.stripeAccountId !== reversal.stripeAccountId) return null;
  const payout = await ctx.db.get("payouts", payment.payoutId);
  return payout === null ? null : { payment, payout };
}

type DisputeEvent = ChargeReversal & { stripeDisputeId: string; reason: string; amount: number };

/**
 * Applies `charge.dispute.created`: the company disputed the charge with its
 * bank, and Stripe holds the amount from the creator's balance meanwhile. The
 * payout stays `transferred`, so recovery never charges the company again.
 * Tells the creator, who alone can respond in their Stripe Dashboard, and
 * Tomoji's operators. A dispute that already closed is never reopened.
 */
export async function recordDisputeOpened(
  ctx: MutationCtx,
  event: DisputeEvent,
): Promise<"updated" | "unchanged" | "unknown"> {
  const charged = await getChargedPayment(ctx, event);
  if (charged === null) return "unknown";
  const { payment, payout } = charged;
  if (payment.dispute?.stripeDisputeId === event.stripeDisputeId) return "unchanged";
  await ctx.db.patch("payments", payment._id, {
    dispute: {
      stripeDisputeId: event.stripeDisputeId,
      status: "open",
      reason: event.reason,
      amount: event.amount,
    },
  });
  const amount = formatAmount(event.amount, payout.currency);
  const target = { kind: "assignment" as const, assignmentId: payout.assignmentId };
  await notifyCreator(ctx, payout.creatorId, {
    type: "payoutDisputed",
    title: `A company disputed a ${amount} payment to you`,
    body: "Stripe is holding the amount. Respond with evidence in your Stripe Dashboard.",
    target,
  });
  await notifyOperators(ctx, {
    type: "payoutDisputed",
    title: `${amount} payment to ${await creatorName(ctx, payout.creatorId)} disputed`,
    body: `The company disputed the charge with its bank (${event.reason}).`,
    target,
  });
  return "updated";
}

/**
 * Applies `charge.dispute.closed`. Only a `lost` dispute keeps the money from
 * the creator; Stripe's other closing results return it. The result is final,
 * and a close that arrives before its open is recorded anyway.
 */
export async function recordDisputeClosed(
  ctx: MutationCtx,
  event: DisputeEvent & { won: boolean },
): Promise<"updated" | "unchanged" | "unknown"> {
  const charged = await getChargedPayment(ctx, event);
  if (charged === null) return "unknown";
  const { payment, payout } = charged;
  const status = event.won ? "won" : "lost";
  if (
    payment.dispute?.stripeDisputeId === event.stripeDisputeId &&
    payment.dispute.status !== "open"
  ) {
    return "unchanged";
  }
  await ctx.db.patch("payments", payment._id, {
    dispute: {
      stripeDisputeId: event.stripeDisputeId,
      status,
      reason: event.reason,
      amount: event.amount,
    },
  });
  await notifyOperators(ctx, {
    type: "payoutDisputeClosed",
    title: `Dispute on a ${formatAmount(event.amount, payout.currency)} payment to ${await creatorName(ctx, payout.creatorId)} ${status}`,
    target: { kind: "assignment", assignmentId: payout.assignmentId },
  });
  return "updated";
}

/**
 * Applies `charge.refunded`: the creator refunded the charge from their Stripe
 * Dashboard. `refundedAmount` is Stripe's running total, so only a larger
 * total changes anything. The payout stays `transferred`; operators decide
 * what the refund means for the work.
 */
export async function recordRefund(
  ctx: MutationCtx,
  event: ChargeReversal & { refundedAmount: number },
): Promise<"updated" | "unchanged" | "unknown"> {
  const charged = await getChargedPayment(ctx, event);
  if (charged === null) return "unknown";
  const { payment, payout } = charged;
  if (event.refundedAmount <= (payment.refundedAmount ?? 0)) return "unchanged";
  await ctx.db.patch("payments", payment._id, { refundedAmount: event.refundedAmount });
  await notifyOperators(ctx, {
    type: "payoutRefunded",
    title: `${await creatorName(ctx, payout.creatorId)} refunded ${formatAmount(event.refundedAmount, payout.currency)} of a payment`,
    body: "Refunded from the creator's Stripe Dashboard, outside Tomoji.",
    target: { kind: "assignment", assignmentId: payout.assignmentId },
  });
  return "updated";
}
