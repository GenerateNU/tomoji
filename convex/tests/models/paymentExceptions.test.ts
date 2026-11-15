/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  recordDisputeClosed,
  recordDisputeOpened,
  recordPaymentSucceeded,
  recordRefund,
  startPayment,
} from "../../models/payments";
import schema from "../../schema";
import { seedAssignmentFixture, seedOperator, seedPayout } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const CREATOR_ACCOUNT = "acct_creator";
const CHARGE = "pi_charged";

/** A payout charged successfully on the creator's account, with one operator to notify. */
async function seedCharged() {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  await seedOperator(t, "exceptions_operator");
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: 1_700_000_000_000,
    amount: 15_000,
  });
  const paymentId = await t.run(async (ctx) => {
    const payment = await startPayment(ctx, payoutId, CREATOR_ACCOUNT);
    await recordPaymentSucceeded(ctx, {
      paymentId: payment._id,
      stripeAccountId: CREATOR_ACCOUNT,
      stripePaymentIntentId: CHARGE,
      succeededAt: 1_700_000_100_000,
    });
    return payment._id;
  });
  return {
    t,
    fixture,
    payment: () => t.run((ctx) => ctx.db.get("payments", paymentId)),
    payout: () => t.run((ctx) => ctx.db.get("payouts", payoutId)),
    notifications: () => t.run((ctx) => ctx.db.query("notifications").collect()),
  };
}

const dispute = {
  stripeAccountId: CREATOR_ACCOUNT,
  stripePaymentIntentId: CHARGE,
  stripeDisputeId: "dp_test",
  reason: "fraudulent",
  amount: 15_000,
};

describe("recordDisputeOpened", () => {
  test("records the open dispute without touching the payout", async () => {
    const { t, payment, payout } = await seedCharged();

    expect(await t.run((ctx) => recordDisputeOpened(ctx, dispute))).toBe("updated");

    expect(await payment()).toMatchObject({
      status: "succeeded",
      dispute: { stripeDisputeId: "dp_test", status: "open", reason: "fraudulent", amount: 15_000 },
    });
    // Recovery must never charge the company again over a chargeback.
    expect((await payout())?.paymentStatus).toBe("transferred");
  });

  // Only the creator can answer a dispute on their Standard account; staff look into it.
  test("tells the creator and Tomoji's operators", async () => {
    const { t, fixture, notifications } = await seedCharged();

    await t.run((ctx) => recordDisputeOpened(ctx, dispute));

    const sent = await notifications();
    expect(sent.map((n) => n.type)).toEqual(["payoutDisputed", "payoutDisputed"]);
    expect(sent.map((n) => n.userId)).toContain(fixture.creatorUserId);
    expect(sent[0].target).toEqual({ kind: "assignment", assignmentId: fixture.assignmentId });
  });

  test("ignores a repeated event", async () => {
    const { t, notifications } = await seedCharged();
    await t.run((ctx) => recordDisputeOpened(ctx, dispute));

    expect(await t.run((ctx) => recordDisputeOpened(ctx, dispute))).toBe("unchanged");
    expect(await notifications()).toHaveLength(2);
  });

  // Stripe can deliver the close before the open; the result must stick.
  test("does not reopen a dispute that already closed", async () => {
    const { t, payment } = await seedCharged();
    await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: false }));

    expect(await t.run((ctx) => recordDisputeOpened(ctx, dispute))).toBe("unchanged");
    expect((await payment())?.dispute?.status).toBe("lost");
  });

  // Other deployments share the Stripe sandbox and receive each other's events.
  test("ignores a charge this deployment did not make", async () => {
    const { t } = await seedCharged();

    expect(
      await t.run((ctx) =>
        recordDisputeOpened(ctx, { ...dispute, stripePaymentIntentId: "pi_elsewhere" }),
      ),
    ).toBe("unknown");
    expect(
      await t.run((ctx) => recordDisputeOpened(ctx, { ...dispute, stripeAccountId: "acct_other" })),
    ).toBe("unknown");
  });
});

describe("recordDisputeClosed", () => {
  test("records a lost dispute and tells operators", async () => {
    const { t, payment, notifications } = await seedCharged();
    await t.run((ctx) => recordDisputeOpened(ctx, dispute));

    expect(await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: false }))).toBe(
      "updated",
    );

    expect((await payment())?.dispute?.status).toBe("lost");
    expect((await notifications()).filter((n) => n.type === "payoutDisputeClosed")).toHaveLength(1);
  });

  test("records a won dispute", async () => {
    const { t, payment } = await seedCharged();
    await t.run((ctx) => recordDisputeOpened(ctx, dispute));

    await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: true }));

    expect((await payment())?.dispute?.status).toBe("won");
  });

  test("records a close that arrives without the open", async () => {
    const { t, payment } = await seedCharged();

    expect(await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: true }))).toBe(
      "updated",
    );
    expect((await payment())?.dispute).toMatchObject({ stripeDisputeId: "dp_test", status: "won" });
  });

  test("ignores a repeated close", async () => {
    const { t } = await seedCharged();
    await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: false }));

    expect(await t.run((ctx) => recordDisputeClosed(ctx, { ...dispute, won: false }))).toBe(
      "unchanged",
    );
  });
});

describe("recordRefund", () => {
  test("records the refunded amount and tells operators", async () => {
    const { t, payment, payout, notifications } = await seedCharged();

    expect(
      await t.run((ctx) =>
        recordRefund(ctx, {
          stripeAccountId: CREATOR_ACCOUNT,
          stripePaymentIntentId: CHARGE,
          refundedAmount: 15_000,
        }),
      ),
    ).toBe("updated");

    expect((await payment())?.refundedAmount).toBe(15_000);
    expect((await payout())?.paymentStatus).toBe("transferred");
    expect(await notifications()).toMatchObject([{ type: "payoutRefunded" }]);
  });

  // Stripe reports the total refunded so far; a partial refund can grow, never shrink.
  test("keeps the largest refunded total", async () => {
    const { t, payment, notifications } = await seedCharged();
    const refund = (refundedAmount: number) =>
      t.run((ctx) =>
        recordRefund(ctx, {
          stripeAccountId: CREATOR_ACCOUNT,
          stripePaymentIntentId: CHARGE,
          refundedAmount,
        }),
      );

    await refund(5_000);
    await refund(15_000);
    expect(await refund(5_000)).toBe("unchanged");

    expect((await payment())?.refundedAmount).toBe(15_000);
    expect(await notifications()).toHaveLength(2);
  });
});
