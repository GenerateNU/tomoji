/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createStripeAccount } from "../models/stripeAccounts";
import { createStripeCustomer, savePaymentMethod } from "../models/stripeCustomers";
import schema from "../schema";
import { seedAssignmentFixture, seedPayout } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const CREATOR_ACCOUNT = "acct_creator";
const COMPANY_CUSTOMER = "cus_company";
const COMPANY_CARD = "pm_company_visa";

// The SDK exports no resource classes, so the prototypes come from a throwaway
// instance. Spying there intercepts every client the charging action builds.
const client = new Stripe("sk_test_tomoji");
const accounts = Object.getPrototypeOf(client.accounts);
const paymentMethods = Object.getPrototypeOf(client.paymentMethods);
const paymentIntents = Object.getPrototypeOf(client.paymentIntents);

function stubStripe() {
  return {
    retrieveAccount: vi
      .spyOn(accounts, "retrieve")
      .mockResolvedValue({ id: CREATOR_ACCOUNT, charges_enabled: true } as never),
    cloneCard: vi
      .spyOn(paymentMethods, "create")
      .mockResolvedValue({ id: "pm_cloned", object: "payment_method" } as never),
    createIntent: vi
      .spyOn(paymentIntents, "create")
      .mockResolvedValue({ id: "pi_test", object: "payment_intent", status: "succeeded" } as never),
    // Charges Stripe already made for an attempt, found by its `paymentId` tag.
    searchIntents: vi
      .spyOn(paymentIntents, "search")
      .mockResolvedValue({ object: "search_result", data: [] } as never),
  };
}

let stripe: ReturnType<typeof stubStripe>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji");
  stripe = stubStripe();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** An approved, uncharged payout whose creator and company are ready, unless told otherwise. */
async function seedDuePayout({ companyCard = true } = {}) {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    approvalStatus: "approved",
    approvalSource: "automatic",
    approvedAt: 1_700_000_000_000,
    amount: 15_000,
  });
  await t.run(async (ctx) => {
    const payout = await ctx.db.get("payouts", payoutId);
    if (payout === null) throw new Error("expected seeded payout");
    await createStripeAccount(ctx, payout.creatorId, {
      stripeAccountId: CREATOR_ACCOUNT,
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      stripeUpdatedAt: 1,
    });
    await createStripeCustomer(ctx, payout.companyId, {
      stripeCustomerId: COMPANY_CUSTOMER,
      stripeUpdatedAt: 1,
    });
    if (companyCard) {
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
  return {
    t,
    payoutId,
    payout: () => t.run((ctx) => ctx.db.get("payouts", payoutId)),
    attempts: () =>
      t.run((ctx) =>
        ctx.db
          .query("payments")
          .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId as Id<"payouts">))
          .collect(),
      ),
    run: async () => {
      await t.mutation(internal.charging.chargeDue, {});
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    },
  };
}

describe("charging approved payouts", () => {
  test("charges the company's card on the creator's account and marks the payout transferred", async () => {
    const { payout, attempts, run } = await seedDuePayout();

    await run();

    const [attempt] = await attempts();
    expect(attempt).toMatchObject({
      attempt: 1,
      status: "succeeded",
      stripePaymentIntentId: "pi_test",
    });
    expect((await payout())?.paymentStatus).toBe("transferred");
    // The company's saved card is copied onto the creator's account, once per attempt.
    expect(stripe.cloneCard).toHaveBeenCalledWith(
      { customer: COMPANY_CUSTOMER, payment_method: COMPANY_CARD },
      // The card in the key: a resumed attempt may send a card the company swapped in.
      {
        stripeAccount: CREATOR_ACCOUNT,
        idempotencyKey: `payment:${attempt._id}:card:${COMPANY_CARD}`,
      },
    );
    // Exactly the earned amount, off-session, tagged so webhooks find the attempt.
    expect(stripe.createIntent).toHaveBeenCalledWith(
      {
        amount: 15_000,
        currency: "usd",
        payment_method: "pm_cloned",
        confirm: true,
        off_session: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { paymentId: attempt._id, payoutId: attempt.payoutId },
      },
      { stripeAccount: CREATOR_ACCOUNT, idempotencyKey: `payment:${attempt._id}` },
    );
  });

  test("records a decline with the issuer's reason and flags the payout", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    stripe.createIntent.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        type: "card_error",
        code: "card_declined",
        decline_code: "insufficient_funds",
        message: "Your card has insufficient funds.",
        payment_intent: { id: "pi_declined", object: "payment_intent" },
      } as never),
    );

    await run();

    expect(await attempts()).toMatchObject([
      { status: "failed", failureCode: "insufficient_funds", stripePaymentIntentId: "pi_declined" },
    ]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // A dropped connection leaves it unknown whether Stripe charged. Retrying the
  // same attempt reuses its key, so Stripe returns the original charge if any.
  test("retries an unconfirmed charge with the same key instead of charging twice", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createIntent.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" }),
    );

    await run();

    expect(await attempts()).toMatchObject([{ attempt: 1, status: "succeeded" }]);
    expect((await payout())?.paymentStatus).toBe("transferred");
    const keys = stripe.createIntent.mock.calls.map(
      ([, options]) => (options as Stripe.RequestOptions).idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    // Before resending, Stripe is asked whether the first request made a charge.
    expect(stripe.searchIntents).toHaveBeenCalledWith(
      { query: `metadata['paymentId']:'${(await attempts())[0]._id}'` },
      { stripeAccount: CREATOR_ACCOUNT },
    );
  });

  // The first request charged the company but its reply was lost. Resending could
  // charge twice once Stripe forgets the key, so the existing charge is used instead.
  test("uses the charge Stripe already made instead of charging again", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createIntent.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" }),
    );
    stripe.searchIntents.mockResolvedValue({
      object: "search_result",
      data: [{ id: "pi_made_earlier", object: "payment_intent", status: "succeeded" }],
    } as never);

    await run();

    expect(stripe.createIntent).toHaveBeenCalledTimes(1);
    expect(await attempts()).toMatchObject([
      { status: "succeeded", stripePaymentIntentId: "pi_made_earlier" },
    ]);
    expect((await payout())?.paymentStatus).toBe("transferred");
  });

  // Karim's case: the reply was lost, then the company removed its card. Failing the
  // attempt without asking Stripe would let a later retry charge the company twice.
  test("checks Stripe before failing a resumed attempt whose card was removed", async () => {
    const { t, payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createIntent.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" }),
    );
    // Before the retry runs, the company deletes its card in Tomoji.
    stripe.searchIntents.mockImplementation((async () => {
      await t.run(async (ctx) => {
        const customer = await ctx.db.query("stripeCustomers").first();
        if (customer !== null)
          await ctx.db.patch("stripeCustomers", customer._id, { card: undefined });
      });
      return {
        object: "search_result",
        data: [{ id: "pi_went_through", object: "payment_intent", status: "succeeded" }],
      };
    }) as never);

    await run();

    expect(await attempts()).toMatchObject([
      { status: "succeeded", stripePaymentIntentId: "pi_went_through" },
    ]);
    expect((await payout())?.paymentStatus).toBe("transferred");
  });

  test("fails a resumed attempt only once Stripe confirms there is no charge", async () => {
    const { t, payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The reply is lost, and the company deletes its card before the retry runs.
    stripe.createIntent.mockImplementationOnce((async () => {
      await t.run(async (ctx) => {
        const customer = await ctx.db.query("stripeCustomers").first();
        if (customer !== null)
          await ctx.db.patch("stripeCustomers", customer._id, { card: undefined });
      });
      throw new Stripe.errors.StripeConnectionError({ message: "socket hang up" });
    }) as never);

    await run();

    expect(stripe.searchIntents).toHaveBeenCalledTimes(1);
    expect(stripe.createIntent).toHaveBeenCalledTimes(1);
    expect(await attempts()).toMatchObject([
      { status: "failed", failureCode: "company_card_missing" },
    ]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // An idempotency error means the key's first request had other parameters, such
  // as a card swapped since. Retrying would fail the same way forever, unseen.
  test("flags the attempt when Stripe refuses the resent request", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createIntent
      .mockRejectedValueOnce(new Stripe.errors.StripeConnectionError({ message: "socket hang up" }))
      .mockRejectedValue(
        new Stripe.errors.StripeIdempotencyError({
          type: "idempotency_error",
          message: "Keys for idempotent requests can only be used with the same parameters",
        }),
      );

    await run();

    expect(stripe.createIntent).toHaveBeenCalledTimes(2);
    expect(await attempts()).toMatchObject([
      { status: "failed", failureCode: "idempotency_error" },
    ]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // An invalid request proves Stripe made no charge, so there is nothing to retry.
  test("flags the attempt when Stripe rejects the charge request as invalid", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createIntent.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "payment_method_unexpected_state",
        message: "The payment method can't be used",
      }),
    );

    await run();

    expect(stripe.createIntent).toHaveBeenCalledTimes(1);
    expect(await attempts()).toMatchObject([
      { status: "failed", failureCode: "payment_method_unexpected_state" },
    ]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  // Stripe's live answer can lag our stored status, for example right after a pause.
  test("does not charge a creator whose account cannot accept charges", async () => {
    const { payout, attempts, run } = await seedDuePayout();
    stripe.retrieveAccount.mockResolvedValue({
      id: CREATOR_ACCOUNT,
      charges_enabled: false,
    } as never);

    await run();

    expect(stripe.createIntent).not.toHaveBeenCalled();
    expect(await attempts()).toMatchObject([
      { status: "failed", failureCode: "creator_not_ready" },
    ]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
  });

  test("does not charge when the company has no saved card", async () => {
    const { attempts, run } = await seedDuePayout({ companyCard: false });

    await run();

    expect(stripe.cloneCard).not.toHaveBeenCalled();
    expect(stripe.createIntent).not.toHaveBeenCalled();
    expect(await attempts()).toMatchObject([{ failureCode: "company_card_missing" }]);
  });

  // Losing access proves the creator removed Tomoji in Stripe.
  test("marks the creator disconnected when Stripe refuses access to their account", async () => {
    const { t, payout, attempts, run } = await seedDuePayout();
    stripe.retrieveAccount.mockRejectedValue(
      new Stripe.errors.StripePermissionError({
        type: "invalid_request_error",
        code: "account_invalid",
        message: "The provided key does not have access to account",
      }),
    );

    await run();

    expect(stripe.createIntent).not.toHaveBeenCalled();
    expect(await attempts()).toMatchObject([{ failureCode: "creator_not_ready" }]);
    expect((await payout())?.paymentStatus).toBe("needsAttention");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("stripeAccounts")
          .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", CREATOR_ACCOUNT))
          .unique(),
      ),
    ).toMatchObject({ disconnectedAt: expect.any(Number) });
  });

  // Without Stripe there is nothing to charge with; queueing would strand payouts.
  test("leaves payouts uncharged when the deployment has no Stripe key", async () => {
    const { payout, run } = await seedDuePayout();
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await run();

    expect((await payout())?.paymentStatus).toBe("notStarted");
    expect(stripe.createIntent).not.toHaveBeenCalled();
  });
});
