/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  attachPaymentIntent,
  findStalePayouts,
  prepareCharge,
  recordPaymentFailed,
  requeueCompanyPayouts,
  requeueCreatorPayouts,
  requeueResolvedDisputes,
  retryPayout,
} from "../../models/payments";
import { createStripeAccount } from "../../models/stripeAccounts";
import { createStripeCustomer, savePaymentMethod } from "../../models/stripeCustomers";
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
const COMPANY_CUSTOMER = "cus_company";

/** A queued payout for a creator and company set up as `setup` says. */
async function seedQueued(setup: { creatorReady?: boolean; companyCard?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: 1_700_000_000_000,
    paymentStatus: "queued",
    amount: 15_000,
  });
  const { creatorId, companyId } = await t.run(async (ctx) => {
    const payout = await ctx.db.get("payouts", payoutId);
    if (payout === null) throw new Error("expected seeded payout");
    await createStripeAccount(ctx, payout.creatorId, {
      stripeAccountId: CREATOR_ACCOUNT,
      detailsSubmitted: true,
      payoutsEnabled: setup.creatorReady ?? true,
      requirementsDue: !(setup.creatorReady ?? true),
      stripeUpdatedAt: 1,
    });
    await createStripeCustomer(ctx, payout.companyId, {
      stripeCustomerId: COMPANY_CUSTOMER,
      stripeUpdatedAt: 1,
    });
    if (setup.companyCard ?? true) {
      await savePaymentMethod(ctx, {
        stripeCustomerId: COMPANY_CUSTOMER,
        card: {
          paymentMethodId: "pm_visa",
          brand: "visa",
          last4: "4242",
          expMonth: 8,
          expYear: 2030,
        },
        stripeUpdatedAt: 2,
      });
    }
    return { creatorId: payout.creatorId, companyId: payout.companyId };
  });
  return {
    t,
    fixture,
    payoutId,
    creatorId,
    companyId,
    payout: () => t.run((ctx) => ctx.db.get("payouts", payoutId)),
    notifications: () => t.run((ctx) => ctx.db.query("notifications").collect()),
  };
}

/** Charges the queued payout and records Stripe declining it with `code`. */
async function declineWith(t: TestConvex, payoutId: Id<"payouts">, code: string) {
  const plan = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
  if (plan.kind !== "charge") throw new Error("expected a charge");
  await t.run((ctx) =>
    recordPaymentFailed(ctx, {
      paymentId: plan.payment._id,
      stripeAccountId: CREATOR_ACCOUNT,
      stripePaymentIntentId: "pi_declined",
      failureCode: code,
    }),
  );
}

describe("notifying about payouts that need attention", () => {
  // The company fixes card problems, so it hears about them; an admin updates the card.
  test("tells the campaign's creator on the company side when the card is declined", async () => {
    const { t, fixture, payoutId, notifications } = await seedQueued();

    await declineWith(t, payoutId, "insufficient_funds");

    const [notification] = await notifications();
    const campaignCreator = await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      const campaign = assignment && (await ctx.db.get("campaigns", assignment.campaignId));
      const member = campaign && (await ctx.db.get("companyUsers", campaign.createdBy));
      return member?.userId;
    });
    expect(notification).toMatchObject({
      userId: campaignCreator,
      type: "payoutPaymentFailed",
      target: { kind: "assignment", assignmentId: fixture.assignmentId },
    });
    expect(notification.title).toContain("$150.00");
  });

  test("tells the company when it has no saved card", async () => {
    const { t, payoutId, notifications } = await seedQueued({ companyCard: false });

    await t.run((ctx) => prepareCharge(ctx, payoutId, true));

    expect(await notifications()).toMatchObject([{ type: "payoutPaymentFailed" }]);
  });

  // The creator fixes their own Stripe account, so they hear about it.
  test("tells the creator when their Stripe account is not ready", async () => {
    const { t, fixture, payoutId, notifications } = await seedQueued({ creatorReady: false });

    await t.run((ctx) => prepareCharge(ctx, payoutId, true));

    expect(await notifications()).toMatchObject([
      {
        userId: fixture.creatorUserId,
        type: "payoutStripeSetupNeeded",
        target: { kind: "assignment", assignmentId: fixture.assignmentId },
      },
    ]);
  });

  // Stripe and the charging run can both report the same decline.
  test("notifies once when the same failure is recorded twice", async () => {
    const { t, payoutId, notifications } = await seedQueued();
    await declineWith(t, payoutId, "card_declined");
    const [attempt] = await t.run((ctx) => ctx.db.query("payments").collect());

    await t.run((ctx) =>
      recordPaymentFailed(ctx, {
        paymentId: attempt._id,
        stripeAccountId: CREATOR_ACCOUNT,
        stripePaymentIntentId: "pi_declined",
        failureCode: "card_declined",
      }),
    );

    expect(await notifications()).toHaveLength(1);
  });
});

describe("retryPayout", () => {
  test("returns a payout that needs attention to the charging queue", async () => {
    const { t, payoutId, payout } = await seedQueued();
    await declineWith(t, payoutId, "card_declined");

    await t.run((ctx) => retryPayout(ctx, payoutId));

    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  test("refuses a payout that does not need attention", async () => {
    const { t, payoutId } = await seedQueued();

    await expectApiError(
      () => t.run((ctx) => retryPayout(ctx, payoutId)),
      "invalid_state",
      "payout_not_retryable",
    );
  });
});

describe("requeueCompanyPayouts", () => {
  // A new card fixes card problems, not a creator's unfinished Stripe setup.
  test("requeues the company's payouts that failed on its card", async () => {
    const { t, payoutId, companyId, payout } = await seedQueued();
    await declineWith(t, payoutId, "generic_decline");

    expect(await t.run((ctx) => requeueCompanyPayouts(ctx, companyId))).toBe(1);
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  test("leaves payouts blocked on the creator", async () => {
    const { t, payoutId, companyId, payout } = await seedQueued({ creatorReady: false });
    await t.run((ctx) => prepareCharge(ctx, payoutId, true));

    expect(await t.run((ctx) => requeueCompanyPayouts(ctx, companyId))).toBe(0);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });
});

describe("requeueCreatorPayouts", () => {
  test("requeues the creator's payouts that waited on their Stripe account", async () => {
    const { t, payoutId, creatorId, payout } = await seedQueued({ creatorReady: false });
    await t.run((ctx) => prepareCharge(ctx, payoutId, true));

    expect(await t.run((ctx) => requeueCreatorPayouts(ctx, creatorId))).toBe(1);
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  test("leaves payouts that failed on the company's card", async () => {
    const { t, payoutId, creatorId, payout } = await seedQueued();
    await declineWith(t, payoutId, "card_declined");

    expect(await t.run((ctx) => requeueCreatorPayouts(ctx, creatorId))).toBe(0);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });
});

describe("requeueResolvedDisputes", () => {
  test("requeues a payout once its assignment's dispute is resolved", async () => {
    const { t, fixture, payoutId, payout } = await seedQueued();
    const disputeId = await seedDispute(t, fixture);
    await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    expect((await payout())?.paymentStatus).toBe("needsAttention");

    // Still open: nothing changes.
    expect(await t.run((ctx) => requeueResolvedDisputes(ctx, null))).toMatchObject({ requeued: 0 });

    await t.run((ctx) => ctx.db.delete("disputes", disputeId));
    expect(await t.run((ctx) => requeueResolvedDisputes(ctx, null))).toMatchObject({ requeued: 1 });
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });
});

describe("findStalePayouts", () => {
  // The charging run claims payouts within a minute; one still queued long
  // after approval lost its scheduled charge.
  test("finds payouts queued long after approval", async () => {
    const { t, payoutId } = await seedQueued();

    expect(await t.run((ctx) => findStalePayouts(ctx, 1_700_000_000_001, 25))).toEqual([payoutId]);
    expect(await t.run((ctx) => findStalePayouts(ctx, 1_699_999_999_999, 25))).toEqual([]);
  });

  // A charge whose outcome never arrived, with or without Stripe's charge id.
  test("finds attempts left processing past the cutoff", async () => {
    const { t, payoutId } = await seedQueued();
    const plan = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    if (plan.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) => attachPaymentIntent(ctx, plan.payment._id, "pi_lost"));

    expect(await t.run((ctx) => findStalePayouts(ctx, Date.now() + 1, 25))).toEqual([payoutId]);
    expect(await t.run((ctx) => findStalePayouts(ctx, Date.now() - 60_000, 25))).toEqual([]);
  });

  // The sweep resumes the attempt through the normal charging path.
  test("reports a charge awaiting its outcome so it can be checked with Stripe", async () => {
    const { t, payoutId } = await seedQueued();
    const plan = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    if (plan.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) => attachPaymentIntent(ctx, plan.payment._id, "pi_lost"));

    expect(await t.run((ctx) => prepareCharge(ctx, payoutId, true))).toMatchObject({
      kind: "check",
      payment: { stripePaymentIntentId: "pi_lost" },
    });
  });
});
