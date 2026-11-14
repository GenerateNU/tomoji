/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  attachPaymentIntent,
  recordPaymentFailed,
  recordPaymentFee,
  recordPaymentSucceeded,
  startPayment,
} from "../../models/payments";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedDispute,
  seedPayout,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const CREATOR_ACCOUNT = "acct_creator";

/** An approved payout, ready to collect, unless `overrides` say otherwise. */
async function seedApprovedPayout(overrides: Parameters<typeof seedPayout>[2] = {}) {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: Date.now(),
    ...overrides,
  });
  const payout = () => t.run((ctx) => ctx.db.get("payouts", payoutId));
  return { t, fixture, payoutId, payout };
}

function start(t: TestConvex, payoutId: Id<"payouts">) {
  return t.run((ctx) => startPayment(ctx, payoutId, CREATOR_ACCOUNT));
}

const succeeded = (paymentId: string) => ({
  paymentId,
  stripeAccountId: CREATOR_ACCOUNT,
  stripePaymentIntentId: "pi_test",
  succeededAt: 1_700_000_100_000,
});

const failed = (paymentId: string) => ({
  paymentId,
  stripeAccountId: CREATOR_ACCOUNT,
  stripePaymentIntentId: "pi_test",
  failureCode: "card_declined",
});

const fee = (paymentId: string) => ({
  paymentId,
  stripeAccountId: CREATOR_ACCOUNT,
  stripeFee: 38,
  creatorNet: 105,
  settlementCurrency: "cad",
});

describe("startPayment", () => {
  test("records the first attempt and marks the payout processing", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();

    const payment = await start(t, payoutId);

    expect(payment).toMatchObject({
      payoutId,
      attempt: 1,
      stripeAccountId: CREATOR_ACCOUNT,
      status: "processing",
    });
    expect(payment.stripePaymentIntentId).toBeUndefined();
    expect((await payout())?.paymentStatus).toBe("processing");
  });

  // Approval is what authorizes the charge; a pending payout is still under review.
  test("refuses a payout that is not approved", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout({
      approvalStatus: "pending",
      approvalSource: undefined,
      approvedAt: undefined,
    });

    await expectApiError(() => start(t, payoutId), "invalid_state", "payout_not_approved");
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  // A second attempt while one is in flight could charge the company twice.
  test("refuses while an attempt is still processing", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    await start(t, payoutId);

    await expectApiError(() => start(t, payoutId), "invalid_state", "payment_in_progress");
  });

  test("refuses a payout that was already paid", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)));

    await expectApiError(() => start(t, payoutId), "invalid_state", "payout_already_paid");
  });

  // A dispute opened after approval still stops the money moving.
  test("refuses while the assignment has an open dispute", async () => {
    const { t, fixture, payoutId, payout } = await seedApprovedPayout();
    await seedDispute(t, fixture);

    await expectApiError(() => start(t, payoutId), "invalid_state", "payout_disputed");
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  // A retry is a new attempt with a new charge, never a reuse of the failed one.
  test("numbers a retry after a failure as the next attempt", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const first = await start(t, payoutId);
    await t.run((ctx) => recordPaymentFailed(ctx, failed(first._id)));

    const second = await start(t, payoutId);

    expect(second.attempt).toBe(2);
    expect((await payout())?.paymentStatus).toBe("processing");
  });
});

describe("attachPaymentIntent", () => {
  test("saves the Stripe charge id on the attempt", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    const payment = await start(t, payoutId);

    await t.run((ctx) => attachPaymentIntent(ctx, payment._id, "pi_test"));

    expect(await t.run((ctx) => ctx.db.get("payments", payment._id))).toMatchObject({
      stripePaymentIntentId: "pi_test",
    });
  });
});

describe("recordPaymentSucceeded", () => {
  test("marks the attempt succeeded and the payout transferred", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);

    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)))).toBe(
      "updated",
    );

    expect(await t.run((ctx) => ctx.db.get("payments", payment._id))).toMatchObject({
      status: "succeeded",
      stripePaymentIntentId: "pi_test",
    });
    expect(await payout()).toMatchObject({
      paymentStatus: "transferred",
      transferredAt: 1_700_000_100_000,
    });
  });

  // Stripe redelivers events; the first success is the one that happened.
  test("ignores a repeated success", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)));

    const again = { ...succeeded(payment._id), succeededAt: 1_700_000_900_000 };
    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, again))).toBe("unchanged");

    expect((await payout())?.transferredAt).toBe(1_700_000_100_000);
  });

  // A failed attempt is final; a retry is a new attempt.
  test("leaves a failed attempt failed", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentFailed(ctx, failed(payment._id)));

    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)))).toBe(
      "unchanged",
    );
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // Other deployments share the Stripe sandbox and receive each other's events.
  test("ignores an attempt this deployment does not have", async () => {
    const { t } = await seedApprovedPayout();

    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded("k57notapayment")))).toBe(
      "unknown",
    );
  });

  // The tag is ours, but the charge must also come from the account we charged.
  test("ignores an event from a different Stripe account", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);

    const elsewhere = {
      ...succeeded(payment._id),
      stripeAccountId: "acct_other",
    };
    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, elsewhere))).toBe("unknown");
    expect((await payout())?.paymentStatus).toBe("processing");
  });
});

describe("recordPaymentFailed", () => {
  test("marks the attempt failed with Stripe's reason and the payout as needing attention", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);

    expect(await t.run((ctx) => recordPaymentFailed(ctx, failed(payment._id)))).toBe("updated");

    expect(await t.run((ctx) => ctx.db.get("payments", payment._id))).toMatchObject({
      status: "failed",
      failureCode: "card_declined",
    });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // A late failure event must not undo money that already moved.
  test("leaves a succeeded attempt and its transferred payout alone", async () => {
    const { t, payoutId, payout } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)));

    expect(await t.run((ctx) => recordPaymentFailed(ctx, failed(payment._id)))).toBe("unchanged");
    expect((await payout())?.paymentStatus).toBe("transferred");
  });
});

describe("recordPaymentFee", () => {
  test("records Stripe's fee and the creator's net in the account's currency", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)));

    expect(await t.run((ctx) => recordPaymentFee(ctx, fee(payment._id)))).toBe("updated");

    expect(await t.run((ctx) => ctx.db.get("payments", payment._id))).toMatchObject({
      stripeFee: 38,
      creatorNet: 105,
      settlementCurrency: "cad",
    });
  });

  // The fee and the success arrive as separate events, in either order.
  test("records the fee even before the success is recorded", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    const payment = await start(t, payoutId);

    expect(await t.run((ctx) => recordPaymentFee(ctx, fee(payment._id)))).toBe("updated");
    expect(await t.run((ctx) => recordPaymentSucceeded(ctx, succeeded(payment._id)))).toBe(
      "updated",
    );

    expect(await t.run((ctx) => ctx.db.get("payments", payment._id))).toMatchObject({
      status: "succeeded",
      stripeFee: 38,
    });
  });

  test("keeps the first fee when the event repeats", async () => {
    const { t, payoutId } = await seedApprovedPayout();
    const payment = await start(t, payoutId);
    await t.run((ctx) => recordPaymentFee(ctx, fee(payment._id)));

    expect(
      await t.run((ctx) => recordPaymentFee(ctx, { ...fee(payment._id), stripeFee: 99 })),
    ).toBe("unchanged");
    expect((await t.run((ctx) => ctx.db.get("payments", payment._id)))?.stripeFee).toBe(38);
  });

  test("ignores an attempt this deployment does not have", async () => {
    const { t } = await seedApprovedPayout();

    expect(await t.run((ctx) => recordPaymentFee(ctx, fee("k57notapayment")))).toBe("unknown");
  });
});
