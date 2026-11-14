/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  attachPaymentIntent,
  claimDuePayouts,
  claimStalePayouts,
  prepareCharge,
  recordPaymentFailed,
  recordPaymentSucceeded,
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
  seedMembership,
  seedOperator,
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
  // Only an admin can update the card, so every active admin hears about it.
  test("tells the company's active admins when the card is declined", async () => {
    const { t, fixture, payoutId, notifications } = await seedQueued();
    const { membership: admin } = await seedMembership(t, "card_admin", "org_fixture", "admin");
    const { membership: former } = await seedMembership(t, "former_admin", "org_fixture", "admin");
    await t.run((ctx) => ctx.db.patch("companyUsers", former._id, { isActive: false }));

    await declineWith(t, payoutId, "insufficient_funds");

    const [notification, ...others] = await notifications();
    expect(others).toEqual([]);
    expect(notification).toMatchObject({
      userId: admin.userId,
      type: "payoutPaymentFailed",
      target: { kind: "assignment", assignmentId: fixture.assignmentId },
    });
    expect(notification.title).toContain("$150.00");
  });

  test("tells the company when it has no saved card", async () => {
    const { t, payoutId, notifications } = await seedQueued({ companyCard: false });
    await seedMembership(t, "card_admin", "org_fixture", "admin");

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
    await seedMembership(t, "card_admin", "org_fixture", "admin");
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
  /** A payout blocked by an open dispute, and a way to close that dispute. */
  async function seedHeldByDispute(openedByRole: "creator" | "company") {
    const queued = await seedQueued();
    const { t, fixture, payoutId } = queued;
    const disputeId = await seedDispute(t, fixture, {
      openedByRole,
      ...(openedByRole === "company"
        ? { openedBy: fixture.membership.userId, reason: "postRemoved" as const }
        : {}),
    });
    await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    const resolve = (outcome: "approved" | "denied" | "withdrawn") =>
      t.run(async (ctx) => {
        const dispute = await ctx.db.get("disputes", disputeId);
        if (dispute === null) throw new Error("expected seeded dispute");
        await ctx.db.replace("disputes", disputeId, {
          ...dispute,
          status: "resolved",
          resolvedBy: fixture.membership.userId,
          resolvedByRole: "operator",
          resolvedAt: 1_700_000_500_000,
          outcome,
        });
      });
    const requeue = () => t.run((ctx) => requeueResolvedDisputes(ctx, null));
    return { ...queued, resolve, requeue };
  }

  test("requeues a payout once its assignment's dispute is resolved", async () => {
    const { payout, resolve, requeue } = await seedHeldByDispute("creator");
    expect((await payout())?.paymentStatus).toBe("needsAttention");

    // Still open: nothing changes.
    expect(await requeue()).toMatchObject({ requeued: 0 });

    await resolve("denied");
    expect(await requeue()).toMatchObject({ requeued: 1 });
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });

  // The company won, so whether the creator is still paid is an operator's call.
  test("holds the payout when a company's dispute is upheld", async () => {
    const { payout, resolve, requeue } = await seedHeldByDispute("company");

    await resolve("approved");

    expect(await requeue()).toMatchObject({ requeued: 0 });
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  test.each(["denied", "withdrawn"] as const)(
    "requeues when a company's dispute is %s",
    async (outcome) => {
      const { payout, resolve, requeue } = await seedHeldByDispute("company");

      await resolve(outcome);

      expect(await requeue()).toMatchObject({ requeued: 1 });
      expect((await payout())?.paymentStatus).toBe("notStarted");
    },
  );

  // A creator winning, e.g. over a missing payment, is a reason to pay them.
  test("requeues when a creator's dispute is upheld", async () => {
    const { payout, resolve, requeue } = await seedHeldByDispute("creator");

    await resolve("approved");

    expect(await requeue()).toMatchObject({ requeued: 1 });
    expect((await payout())?.paymentStatus).toBe("notStarted");
  });
});

describe("claimStalePayouts", () => {
  // The charging run claims payouts within a minute; one still queued long
  // after that lost its scheduled charge.
  test("finds payouts queued long ago", async () => {
    const { t, payoutId } = await seedQueued();
    await t.run((ctx) => ctx.db.patch("payouts", payoutId, { queuedAt: 1_700_000_000_000 }));

    expect(await t.run((ctx) => claimStalePayouts(ctx, 1_699_999_999_999, 25))).toEqual([]);
    expect(await t.run((ctx) => claimStalePayouts(ctx, 1_700_000_000_001, 25))).toEqual([payoutId]);
  });

  // A retried payout keeps its old approval; its charge only just started.
  test("measures from when the payout was queued, not approved", async () => {
    const { t, payoutId } = await seedQueued();
    await t.run((ctx) => ctx.db.patch("payouts", payoutId, { paymentStatus: "notStarted" }));
    await t.run((ctx) => claimDuePayouts(ctx, 25));

    expect(await t.run((ctx) => claimStalePayouts(ctx, Date.now() - 60_000, 25))).toEqual([]);
  });

  // Claiming restarts the clock, so the next sweep leaves the new charge alone.
  test("claims each stale payout once per stale period", async () => {
    const { t, payoutId } = await seedQueued();
    await t.run((ctx) => ctx.db.patch("payouts", payoutId, { queuedAt: 1_700_000_000_000 }));

    const cutoff = Date.now() - 60_000;
    expect(await t.run((ctx) => claimStalePayouts(ctx, cutoff, 25))).toEqual([payoutId]);
    expect(await t.run((ctx) => claimStalePayouts(ctx, cutoff, 25))).toEqual([]);
  });

  // A charge whose outcome never arrived, with or without Stripe's charge id.
  test("finds attempts left processing past the cutoff", async () => {
    const { t, payoutId } = await seedQueued();
    const plan = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    if (plan.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) => attachPaymentIntent(ctx, plan.payment._id, "pi_lost"));

    expect(await t.run((ctx) => claimStalePayouts(ctx, Date.now() - 60_000, 25))).toEqual([]);
    expect(await t.run((ctx) => claimStalePayouts(ctx, Date.now() + 1, 25))).toEqual([payoutId]);
  });

  // Attempts that never settle must not hold the batch forever.
  test("checks the least recently checked attempts first", async () => {
    const first = await seedQueued();
    const { t } = first;
    const fixture = first.fixture;
    const second = await seedPayout(t, fixture.assignmentId, {
      approvalStatus: "approved",
      approvalSource: "automatic",
      approvedAt: 1_700_000_000_000,
      paymentStatus: "queued",
    });
    for (const payoutId of [first.payoutId, second]) {
      const plan = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
      if (plan.kind !== "charge") throw new Error("expected a charge");
    }

    // The first was checked longer ago, so it goes first; checking it moves it last.
    await t.run(async (ctx) => {
      const [a, b] = await ctx.db.query("payments").collect();
      await ctx.db.patch("payments", a._id, { lastCheckedAt: 1_000 });
      await ctx.db.patch("payments", b._id, { lastCheckedAt: 2_000 });
    });
    const later = Date.now() + 1;
    expect(await t.run((ctx) => claimStalePayouts(ctx, later, 1))).toEqual([first.payoutId]);
    expect(await t.run((ctx) => claimStalePayouts(ctx, later, 1))).toEqual([second]);
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

// Karim's backstops: a charge Stripe confirms late must never be lost, and must
// never lead to charging the company a second time.
describe("a success reported after the attempt was marked failed", () => {
  test("still marks the payout paid", async () => {
    const { t, payoutId, payout } = await seedQueued();
    await declineWith(t, payoutId, "card_declined");
    const [attempt] = await t.run((ctx) => ctx.db.query("payments").collect());

    expect(
      await t.run((ctx) =>
        recordPaymentSucceeded(ctx, {
          paymentId: attempt._id,
          stripeAccountId: CREATOR_ACCOUNT,
          stripePaymentIntentId: "pi_declined",
          succeededAt: 1_700_000_200_000,
        }),
      ),
    ).toBe("updated");

    expect((await payout())?.paymentStatus).toBe("transferred");
    await expectApiError(
      () => t.run((ctx) => retryPayout(ctx, payoutId)),
      "invalid_state",
      "payout_not_retryable",
    );
  });

  // Both attempts charged the company: staff need to refund one.
  test("alerts operators when another attempt already paid the payout", async () => {
    const { t, payoutId, payout, notifications } = await seedQueued();
    await seedOperator(t, "double_charge_operator");
    await declineWith(t, payoutId, "card_declined");
    const [first] = await t.run((ctx) => ctx.db.query("payments").collect());
    await t.run((ctx) => retryPayout(ctx, payoutId));
    await t.run((ctx) => ctx.db.patch("payouts", payoutId, { paymentStatus: "queued" }));
    const second = await t.run((ctx) => prepareCharge(ctx, payoutId, true));
    if (second.kind !== "charge") throw new Error("expected a charge");
    await t.run((ctx) =>
      recordPaymentSucceeded(ctx, {
        paymentId: second.payment._id,
        stripeAccountId: CREATOR_ACCOUNT,
        stripePaymentIntentId: "pi_second",
        succeededAt: 1_700_000_300_000,
      }),
    );

    await t.run((ctx) =>
      recordPaymentSucceeded(ctx, {
        paymentId: first._id,
        stripeAccountId: CREATOR_ACCOUNT,
        stripePaymentIntentId: "pi_declined",
        succeededAt: 1_700_000_400_000,
      }),
    );

    expect((await payout())?.transferredAt).toBe(1_700_000_300_000);
    expect((await notifications()).filter((n) => n.type === "payoutChargedTwice")).toHaveLength(1);
  });
});

describe("claimStalePayouts ordering", () => {
  // Payouts legitimately waiting on Stripe must not fill the batch and hide a
  // newer payout whose charge stalled.
  test("finds a stalled attempt behind many recent ones", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_800_000_000_000);
      const { t, fixture, payoutId } = await seedQueued();
      await t.run((ctx) => ctx.db.patch("payouts", payoutId, { approvedAt: 1_799_000_000_000 }));
      await t.run((ctx) => prepareCharge(ctx, payoutId, true)); // Stalls from now on.

      vi.setSystemTime(1_800_000_000_000 + 30 * 60_000);
      for (let i = 0; i < 3; i++) {
        const recent = await seedPayout(t, fixture.assignmentId, {
          approvalStatus: "approved",
          approvalSource: "automatic",
          approvedAt: 1_700_000_000_000 + i, // Approved long before the stalled one.
          paymentStatus: "queued",
        });
        await t.run((ctx) => prepareCharge(ctx, recent, true)); // Started just now.
      }

      const cutoff = 1_800_000_000_000 + 15 * 60_000;
      expect(await t.run((ctx) => claimStalePayouts(ctx, cutoff, 2))).toEqual([payoutId]);
    } finally {
      vi.useRealTimers();
    }
  });
});
