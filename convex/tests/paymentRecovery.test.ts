/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { prepareCharge, recordPaymentFailed } from "../models/payments";
import { createStripeAccount } from "../models/stripeAccounts";
import { createStripeCustomer, savePaymentMethod } from "../models/stripeCustomers";
import schema from "../schema";
import { expectApiError, seedAssignmentFixture, seedMembership, seedPayout } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const CREATOR_ACCOUNT = "acct_creator";
const COMPANY_CUSTOMER = "cus_company";

/** A payout that needs attention, blocked on the company's card or the creator's account. */
async function seedNeedsAttention(blockedOn: "card" | "creator") {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t, {}, "admin");
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: 1_700_000_000_000,
    paymentStatus: "queued",
  });
  await t.run(async (ctx) => {
    const payout = await ctx.db.get("payouts", payoutId);
    if (payout === null) throw new Error("expected seeded payout");
    await createStripeAccount(ctx, payout.creatorId, {
      stripeAccountId: CREATOR_ACCOUNT,
      detailsSubmitted: true,
      payoutsEnabled: blockedOn !== "creator",
      requirementsDue: blockedOn === "creator",
      stripeUpdatedAt: 1,
    });
    await createStripeCustomer(ctx, payout.companyId, {
      stripeCustomerId: COMPANY_CUSTOMER,
      stripeUpdatedAt: 1,
    });
    await savePaymentMethod(ctx, {
      stripeCustomerId: COMPANY_CUSTOMER,
      card: { paymentMethodId: "pm_old", brand: "visa", last4: "0341", expMonth: 8, expYear: 2030 },
      stripeUpdatedAt: 2,
    });
    const plan = await prepareCharge(ctx, payoutId, true);
    if (plan.kind === "charge") {
      await recordPaymentFailed(ctx, {
        paymentId: plan.payment._id,
        stripeAccountId: CREATOR_ACCOUNT,
        stripePaymentIntentId: "pi_declined",
        failureCode: "card_declined",
      });
    }
  });
  return {
    t,
    fixture,
    payoutId,
    paymentStatus: async () =>
      (await t.run((ctx) => ctx.db.get("payouts", payoutId)))?.paymentStatus,
  };
}

const newCard = {
  stripeCustomerId: COMPANY_CUSTOMER,
  card: { paymentMethodId: "pm_new", brand: "visa", last4: "4242", expMonth: 9, expYear: 2031 },
  stripeUpdatedAt: 1_700_000_100_000,
};

describe("payments.retry", () => {
  test("lets a company admin send a payout that needs attention back to be charged", async () => {
    const { fixture, payoutId, paymentStatus } = await seedNeedsAttention("card");
    expect(await paymentStatus()).toBe("needsAttention");

    await fixture.asCompany.mutation(api.payments.retry, { payoutId });

    expect(await paymentStatus()).toBe("notStarted");
  });

  test("refuses a company member who is not an admin", async () => {
    const { t, payoutId } = await seedNeedsAttention("card");
    const { asMember } = await seedMembership(t, "retry_member", "org_fixture", "member");

    await expectApiError(
      () => asMember.mutation(api.payments.retry, { payoutId }),
      "forbidden",
      "company_admin_required",
    );
  });

  // Another company's payout looks the same as a missing one.
  test("hides another company's payout", async () => {
    const { t, payoutId } = await seedNeedsAttention("card");
    const { asMember } = await seedMembership(t, "retry_other", "org_other", "admin");

    await expectApiError(() => asMember.mutation(api.payments.retry, { payoutId }), "not_found");
  });
});

describe("automatic retries", () => {
  test("a newly saved company card sends its card-blocked payouts back to be charged", async () => {
    const { t, paymentStatus } = await seedNeedsAttention("card");

    await t.mutation(internal.stripeCustomers.saveCard, { saved: newCard });

    expect(await paymentStatus()).toBe("notStarted");
  });

  test("a creator's account becoming ready sends their waiting payouts back to be charged", async () => {
    const { t, paymentStatus } = await seedNeedsAttention("creator");
    expect(await paymentStatus()).toBe("needsAttention");

    await t.mutation(internal.stripeAccounts.update, {
      state: {
        stripeAccountId: CREATOR_ACCOUNT,
        detailsSubmitted: true,
        payoutsEnabled: true,
        requirementsDue: false,
        stripeUpdatedAt: 1_700_000_100_000,
      },
    });

    expect(await paymentStatus()).toBe("notStarted");
  });

  test("an account update that is still not ready leaves the payouts waiting", async () => {
    const { t, paymentStatus } = await seedNeedsAttention("creator");

    await t.mutation(internal.stripeAccounts.update, {
      state: {
        stripeAccountId: CREATOR_ACCOUNT,
        detailsSubmitted: true,
        payoutsEnabled: false,
        requirementsDue: true,
        stripeUpdatedAt: 1_700_000_100_000,
      },
    });

    expect(await paymentStatus()).toBe("needsAttention");
  });
});
