/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  attachPaymentIntent,
  claimDuePayouts,
  prepareCharge,
  recordPaymentFailed,
  startPayment,
} from "../../models/payments";
import { createStripeAccount, disconnectStripeAccount } from "../../models/stripeAccounts";
import { createStripeCustomer, savePaymentMethod } from "../../models/stripeCustomers";
import schema from "../../schema";
import {
  seedAssignmentFixture,
  seedDispute,
  seedPayout,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const CREATOR_ACCOUNT = "acct_creator";
const COMPANY_CUSTOMER = "cus_company";
const COMPANY_CARD = "pm_company_visa";

type Setup = { creatorAccount?: "ready" | "pending" | "none"; companyCard?: boolean };

/**
 * An approved payout whose creator and company are set up to be charged,
 * unless `setup` says otherwise.
 */
async function seedChargeable(setup: Setup = {}, overrides: Parameters<typeof seedPayout>[2] = {}) {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: 1_700_000_000_000,
    ...overrides,
  });
  await t.run(async (ctx) => {
    const payout = await ctx.db.get("payouts", payoutId);
    if (payout === null) throw new Error("expected seeded payout");
    const account = setup.creatorAccount ?? "ready";
    if (account !== "none") {
      await createStripeAccount(ctx, payout.creatorId, {
        stripeAccountId: CREATOR_ACCOUNT,
        detailsSubmitted: true,
        payoutsEnabled: account === "ready",
        requirementsDue: account !== "ready",
        stripeUpdatedAt: 1,
      });
    }
    await createStripeCustomer(ctx, payout.companyId, {
      stripeCustomerId: COMPANY_CUSTOMER,
      stripeUpdatedAt: 1,
    });
    if (setup.companyCard ?? true) {
      await savePaymentMethod(ctx, {
        stripeCustomerId: COMPANY_CUSTOMER,
        card: {
          paymentMethodId: COMPANY_CARD,
          brand: "visa",
          last4: "4242",
          expMonth: 8,
          expYear: 2030,
        },
        stripeUpdatedAt: 2,
      });
    }
  });
  const payout = () => t.run((ctx) => ctx.db.get("payouts", payoutId));
  const attempts = () =>
    t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
        .collect(),
    );
  return { t, fixture, payoutId, payout, attempts };
}

function prepare(t: TestConvex, payoutId: Id<"payouts">, chargesEnabled: boolean | null = true) {
  return t.run((ctx) => prepareCharge(ctx, payoutId, chargesEnabled));
}

describe("claimDuePayouts", () => {
  test("queues approved, uncharged payouts, oldest approval first", async () => {
    const { t, fixture, payoutId } = await seedChargeable();
    const older = await seedPayout(t, fixture.assignmentId, {
      approvalStatus: "approved",
      approvalSource: "automatic",
      approvedAt: 1_600_000_000_000,
    });

    const claimed = await t.run((ctx) => claimDuePayouts(ctx, 25));

    expect(claimed).toEqual([older, payoutId]);
    await t.run(async (ctx) => {
      expect((await ctx.db.get("payouts", payoutId))?.paymentStatus).toBe("queued");
      expect((await ctx.db.get("payouts", older))?.paymentStatus).toBe("queued");
    });
  });

  // Claiming moves the payout out of the queue, so the next run never claims it again.
  test("does not claim the same payout twice", async () => {
    const { t } = await seedChargeable();
    await t.run((ctx) => claimDuePayouts(ctx, 25));

    expect(await t.run((ctx) => claimDuePayouts(ctx, 25))).toEqual([]);
  });

  test("leaves pending payouts and respects the batch size", async () => {
    const { t, fixture } = await seedChargeable();
    await seedPayout(t, fixture.assignmentId, { approvalStatus: "pending" });
    await seedPayout(t, fixture.assignmentId, {
      approvalStatus: "approved",
      approvalSource: "automatic",
      approvedAt: 1_700_000_100_000,
    });

    expect(await t.run((ctx) => claimDuePayouts(ctx, 1))).toHaveLength(1);
    expect(await t.run((ctx) => claimDuePayouts(ctx, 25))).toHaveLength(1);
  });
});

describe("prepareCharge", () => {
  test("starts an attempt with the company's card and the payout's amount", async () => {
    const { t, payoutId, payout } = await seedChargeable({}, { paymentStatus: "queued" });

    const plan = await prepare(t, payoutId);

    expect(plan).toMatchObject({
      kind: "charge",
      stripeCustomerId: COMPANY_CUSTOMER,
      paymentMethodId: COMPANY_CARD,
      amount: 10_000,
      currency: "usd",
      payment: { attempt: 1, stripeAccountId: CREATOR_ACCOUNT, status: "processing" },
    });
    expect((await payout())?.paymentStatus).toBe("processing");
  });

  // The charge may have failed to reach Stripe; repeating the same attempt reuses
  // its idempotency key, so Stripe returns the original charge if there was one.
  test("resumes an attempt whose charge was never confirmed", async () => {
    const { t, payoutId, attempts } = await seedChargeable({}, { paymentStatus: "queued" });
    const first = await prepare(t, payoutId);

    const again = await prepare(t, payoutId);

    expect(again).toMatchObject({
      kind: "charge",
      payment: { _id: first.kind === "charge" ? first.payment._id : "" },
    });
    expect(await attempts()).toHaveLength(1);
  });

  // The charge exists; its outcome arrives from Stripe.
  test("does nothing while Stripe settles a created charge", async () => {
    const { t, payoutId } = await seedChargeable({}, { paymentStatus: "queued" });
    const first = await prepare(t, payoutId);
    if (first.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) => attachPaymentIntent(ctx, first.payment._id, "pi_test"));

    expect(await prepare(t, payoutId)).toEqual({ kind: "settled" });
  });

  test("does nothing for a payout that is already paid", async () => {
    const { t, payoutId } = await seedChargeable({}, { paymentStatus: "transferred" });

    expect(await prepare(t, payoutId)).toEqual({ kind: "settled" });
  });

  // Blocked payouts leave the queue, so they cannot hold up everyone else's.
  test("records a missing company card and flags the payout", async () => {
    const { t, payoutId, payout, attempts } = await seedChargeable(
      { companyCard: false },
      { paymentStatus: "queued" },
    );

    expect(await prepare(t, payoutId)).toEqual({ kind: "blocked", reason: "company_card_missing" });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
    expect(await attempts()).toMatchObject([
      {
        attempt: 1,
        status: "failed",
        failureCode: "company_card_missing",
        stripeAccountId: CREATOR_ACCOUNT,
      },
    ]);
  });

  test("records a creator whose Stripe account is not ready", async () => {
    const { t, payoutId, payout, attempts } = await seedChargeable(
      { creatorAccount: "pending" },
      { paymentStatus: "queued" },
    );

    expect(await prepare(t, payoutId)).toEqual({ kind: "blocked", reason: "creator_not_ready" });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
    expect(await attempts()).toMatchObject([{ failureCode: "creator_not_ready" }]);
  });

  // Stripe's live answer can lag our stored status, for example right after a pause.
  test("records a creator whose account Stripe says cannot accept charges", async () => {
    const { t, payoutId, attempts } = await seedChargeable({}, { paymentStatus: "queued" });

    expect(await prepare(t, payoutId, false)).toEqual({
      kind: "blocked",
      reason: "creator_not_ready",
    });
    expect(await attempts()).toMatchObject([{ failureCode: "creator_not_ready" }]);
  });

  test("records a creator who disconnected Tomoji", async () => {
    const { t, payoutId, attempts } = await seedChargeable({}, { paymentStatus: "queued" });
    await t.run((ctx) => disconnectStripeAccount(ctx, CREATOR_ACCOUNT, 1_700_000_100_000));

    expect(await prepare(t, payoutId)).toEqual({ kind: "blocked", reason: "creator_not_ready" });
    expect(await attempts()).toMatchObject([{ failureCode: "creator_not_ready" }]);
  });

  // Applying requires a ready account, so this should never happen; there is no
  // account to record an attempt against, so only the payout is flagged.
  test("flags the payout without an attempt when the creator has no Stripe account", async () => {
    const { t, payoutId, payout, attempts } = await seedChargeable(
      { creatorAccount: "none" },
      { paymentStatus: "queued" },
    );

    expect(await prepare(t, payoutId, null)).toEqual({
      kind: "blocked",
      reason: "creator_account_missing",
    });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
    expect(await attempts()).toEqual([]);
  });

  test("records an open dispute on the assignment", async () => {
    const { t, fixture, payoutId, attempts } = await seedChargeable(
      {},
      { paymentStatus: "queued" },
    );
    await seedDispute(t, fixture as AssignmentFixture);

    expect(await prepare(t, payoutId)).toEqual({ kind: "blocked", reason: "payout_disputed" });
    expect(await attempts()).toMatchObject([{ failureCode: "payout_disputed" }]);
  });

  // A decline already recorded leaves the payout needing attention; recovery,
  // not the charging run, decides when to try again.
  test("does nothing for a payout that needs attention", async () => {
    const { t, payoutId } = await seedChargeable({}, { paymentStatus: "queued" });
    const first = await prepare(t, payoutId);
    if (first.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) =>
      recordPaymentFailed(ctx, {
        paymentId: first.payment._id,
        stripeAccountId: CREATOR_ACCOUNT,
        stripePaymentIntentId: "pi_test",
        failureCode: "card_declined",
      }),
    );

    expect(await prepare(t, payoutId)).toEqual({ kind: "settled" });
  });

  test("leaves startPayment's own checks in place", async () => {
    const { t, payoutId } = await seedChargeable({}, { paymentStatus: "queued" });
    await t.run((ctx) => startPayment(ctx, payoutId, CREATOR_ACCOUNT));

    // The attempt startPayment made is resumed rather than duplicated.
    expect(await prepare(t, payoutId)).toMatchObject({ kind: "charge", payment: { attempt: 1 } });
  });
});
