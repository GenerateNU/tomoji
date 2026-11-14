/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { startPayment } from "../models/payments";
import schema from "../schema";
import { seedAssignmentFixture, seedPayout, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "whsec_test_tomoji";
const CREATOR_ACCOUNT = "acct_creator";

// The SDK exports no resource classes, so the prototype comes from a throwaway
// instance. Spying there intercepts every client the webhook builds.
const balanceTransactions = Object.getPrototypeOf(new Stripe("sk_test_tomoji").balanceTransactions);

let retrieveBalanceTransaction: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji");
  // The router also mounts AuthKit's routes, which read these when loaded.
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_API_KEY", "sk_test_tomoji");
  vi.stubEnv("WORKOS_WEBHOOK_SECRET", "workos_webhook_test");
  // What Stripe recorded for a $1 charge on a Canadian account in the sandbox.
  retrieveBalanceTransaction = vi.spyOn(balanceTransactions, "retrieve").mockResolvedValue({
    id: "txn_test",
    fee: 38,
    net: 105,
    currency: "cad",
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** A Connect event on the creator's account; `created` is in seconds. */
function event(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt_${type}`,
    object: "event",
    type,
    created: 1_700_000_100,
    account: CREATOR_ACCOUNT,
    data: { object },
    ...extra,
  });
}

const intentSucceeded = (paymentId: string, extra: Record<string, unknown> = {}) =>
  event(
    "payment_intent.succeeded",
    {
      id: "pi_test",
      object: "payment_intent",
      status: "succeeded",
      metadata: { paymentId },
    },
    extra,
  );

const intentFailed = (paymentId: string) =>
  event("payment_intent.payment_failed", {
    id: "pi_test",
    object: "payment_intent",
    status: "requires_payment_method",
    metadata: { paymentId },
    last_payment_error: {
      code: "card_declined",
      decline_code: "insufficient_funds",
    },
  });

/**
 * A `charge.updated` event. By default it is Stripe attaching the fee:
 * `balance_transaction` was empty before this update.
 */
function feeAttached(
  paymentId: string,
  previousAttributes: Record<string, unknown> = { balance_transaction: null },
) {
  const charge = {
    id: "ch_test",
    object: "charge",
    payment_intent: "pi_test",
    balance_transaction: "txn_test",
    metadata: { paymentId },
  };
  return event("charge.updated", charge, {
    data: { object: charge, previous_attributes: previousAttributes },
  });
}

/** Posts a payload signed with `secret`, the way Stripe signs deliveries. */
async function deliver(t: TestConvex, payload: string) {
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: SECRET,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return await t.fetch("/stripe/webhook", {
    method: "POST",
    headers: {
      "Stripe-Signature": signature,
      "Content-Type": "application/json",
    },
    body: payload,
  });
}

/** An approved payout with its first attempt charging on the creator's account. */
async function seedProcessingPayment() {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: Date.now(),
  });
  const payment = await t.run((ctx) => startPayment(ctx, payoutId, CREATOR_ACCOUNT));
  return {
    t,
    paymentId: payment._id,
    payment: () => t.run((ctx) => ctx.db.get("payments", payment._id)),
    payout: () => t.run((ctx) => ctx.db.get("payouts", payoutId as Id<"payouts">)),
  };
}

describe("POST /stripe/webhook payment events", () => {
  test("marks the payout transferred when the charge succeeds", async () => {
    const { t, paymentId, payment, payout } = await seedProcessingPayment();

    const response = await deliver(t, intentSucceeded(paymentId));

    expect(response.status).toBe(200);
    expect(await payment()).toMatchObject({
      status: "succeeded",
      stripePaymentIntentId: "pi_test",
    });
    expect(await payout()).toMatchObject({
      paymentStatus: "transferred",
      transferredAt: 1_700_000_100_000,
    });
  });

  test("records the decline reason and flags the payout when the charge fails", async () => {
    const { t, paymentId, payment, payout } = await seedProcessingPayment();

    const response = await deliver(t, intentFailed(paymentId));

    expect(response.status).toBe(200);
    // The issuer's decline code is more specific than Stripe's generic `card_declined`.
    expect(await payment()).toMatchObject({
      status: "failed",
      failureCode: "insufficient_funds",
    });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  test("records Stripe's fee once it is attached to the charge", async () => {
    const { t, paymentId, payment } = await seedProcessingPayment();

    const response = await deliver(t, feeAttached(paymentId));

    expect(response.status).toBe(200);
    expect(retrieveBalanceTransaction).toHaveBeenCalledWith(
      "txn_test",
      {},
      {
        stripeAccount: CREATOR_ACCOUNT,
      },
    );
    expect(await payment()).toMatchObject({
      stripeFee: 38,
      creatorNet: 105,
      settlementCurrency: "cad",
    });
  });

  // Other charge updates, such as a receipt being sent, carry no new fee.
  test("ignores charge updates that are not the fee arriving", async () => {
    const { t, paymentId, payment } = await seedProcessingPayment();

    const response = await deliver(t, feeAttached(paymentId, { receipt_url: null }));

    expect(response.status).toBe(200);
    expect(retrieveBalanceTransaction).not.toHaveBeenCalled();
    expect((await payment())?.stripeFee).toBeUndefined();
  });

  // A 500 makes Stripe redeliver, so the fee is recorded once Stripe recovers.
  test("asks Stripe to retry when the fee cannot be fetched", async () => {
    const { t, paymentId, payment } = await seedProcessingPayment();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    retrieveBalanceTransaction.mockRejectedValue(new Error("Stripe is down"));

    const response = await deliver(t, feeAttached(paymentId));

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledWith(
      "Stripe refused the balance transaction",
      expect.objectContaining({ message: "Stripe is down" }),
    );
    expect((await payment())?.stripeFee).toBeUndefined();
  });

  // Charges made outside Tomoji, or by another deployment, carry no tag of ours.
  test("acknowledges a charge without a Tomoji payment tag", async () => {
    const { t, payment } = await seedProcessingPayment();

    const response = await deliver(
      t,
      event("payment_intent.succeeded", {
        id: "pi_other",
        object: "payment_intent",
        metadata: {},
      }),
    );

    expect(response.status).toBe(200);
    expect((await payment())?.status).toBe("processing");
  });

  test("acknowledges a tag from another deployment without changing anything", async () => {
    const { t, payment } = await seedProcessingPayment();

    const response = await deliver(t, intentSucceeded("k57notapayment"));

    expect(response.status).toBe(200);
    expect((await payment())?.status).toBe("processing");
  });

  // The tag must come with a charge on the account this attempt charged.
  test("ignores an event from a different Stripe account", async () => {
    const { t, paymentId, payment } = await seedProcessingPayment();

    const response = await deliver(t, intentSucceeded(paymentId, { account: "acct_other" }));

    expect(response.status).toBe(200);
    expect((await payment())?.status).toBe("processing");
  });
});

describe("POST /stripe/webhook charges reversed outside Tomoji", () => {
  /** A payout charged successfully as `pi_test` on the creator's account. */
  async function seedCharged() {
    const seeded = await seedProcessingPayment();
    await deliver(seeded.t, intentSucceeded(seeded.paymentId));
    return seeded;
  }

  const disputeEvent = (type: string, status: string) =>
    event(type, {
      id: "dp_test",
      object: "dispute",
      charge: "ch_test",
      payment_intent: "pi_test",
      amount: 10_000,
      reason: "fraudulent",
      status,
    });

  test("records a dispute opening and closing", async () => {
    const { t, payment, payout } = await seedCharged();

    expect(
      (await deliver(t, disputeEvent("charge.dispute.created", "needs_response"))).status,
    ).toBe(200);
    expect((await payment())?.dispute).toMatchObject({ status: "open", reason: "fraudulent" });

    await deliver(t, disputeEvent("charge.dispute.closed", "lost"));
    expect((await payment())?.dispute?.status).toBe("lost");
    expect((await payout())?.paymentStatus).toBe("transferred");
  });

  // Inquiries Stripe closes without a chargeback leave the money with the creator.
  test("treats a dispute closed without a chargeback as won", async () => {
    const { t, payment } = await seedCharged();

    await deliver(t, disputeEvent("charge.dispute.closed", "warning_closed"));

    expect((await payment())?.dispute?.status).toBe("won");
  });

  test("records a refund the creator made in their Stripe Dashboard", async () => {
    const { t, payment } = await seedCharged();

    const response = await deliver(
      t,
      event("charge.refunded", {
        id: "ch_test",
        object: "charge",
        payment_intent: "pi_test",
        amount: 10_000,
        amount_refunded: 4_000,
        metadata: {},
      }),
    );

    expect(response.status).toBe(200);
    expect((await payment())?.refundedAmount).toBe(4_000);
  });

  // Charges made outside Tomoji, or on another deployment, are not ours.
  test("acknowledges a dispute on a charge Tomoji did not make", async () => {
    const { t, payment } = await seedCharged();

    const response = await deliver(
      t,
      event("charge.dispute.created", {
        id: "dp_other",
        object: "dispute",
        charge: "ch_other",
        payment_intent: "pi_other",
        amount: 500,
        reason: "general",
        status: "needs_response",
      }),
    );

    expect(response.status).toBe(200);
    expect((await payment())?.dispute).toBeUndefined();
  });
});
