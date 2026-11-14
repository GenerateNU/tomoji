/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import {
  createStripeCustomer,
  getStripeCustomerByCompanyId,
  savePaymentMethod,
} from "../models/stripeCustomers";
import schema from "../schema";
import {
  expectApiError,
  seedCreatorId,
  seedMembership,
  seedOperator,
  seedUser,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

// The SDK exports no resource classes, so the prototypes come from a throwaway
// instance. Spying there intercepts every client the routes build.
const client = new Stripe("sk_test_tomoji");
const customers = Object.getPrototypeOf(client.customers);
const checkoutSessions = Object.getPrototypeOf(client.checkout.sessions);

const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_setup";

function stubStripe() {
  return {
    createCustomer: vi
      .spyOn(customers, "create")
      .mockResolvedValue({ id: "cus_new", object: "customer", created: 1_700_000_000 } as never),
    createSession: vi
      .spyOn(checkoutSessions, "create")
      .mockResolvedValue({ id: "cs_test_setup", url: CHECKOUT_URL } as never),
  };
}

let stripe: ReturnType<typeof stubStripe>;

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  stripe = stubStripe();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Seeds a company with one person in `role` and signs in as them. */
async function seedCompanyUser(t: TestConvex, subject: string, role: "admin" | "member") {
  const { asMember, membership } = await seedMembership(t, subject, `org_${subject}`, role);
  return { asUser: asMember, companyId: membership.companyId };
}

const visa = {
  paymentMethodId: "pm_visa",
  brand: "visa",
  last4: "4242",
  expMonth: 8,
  expYear: 2028,
};

// The caller's current month. Queries don't rerun as time passes, so the
// client says which month to check the card against.
const NOVEMBER = Date.UTC(2026, 10, 1);

describe("me", () => {
  test("reports missing before the company has saved a card", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_me_new", "admin");

    expect(await asUser.query(api.stripeCustomers.me, { asOf: NOVEMBER })).toEqual({
      status: "missing",
      card: null,
    });
  });

  // Members can see that a card is on file even though only admins change it.
  test("shows a member the company's saved card", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_me_member", "member");
    await t.run(async (ctx) => {
      await createStripeCustomer(ctx, companyId, {
        stripeCustomerId: "cus_company",
        stripeUpdatedAt: 1_700_000_000_000,
      });
      await savePaymentMethod(ctx, {
        stripeCustomerId: "cus_company",
        card: visa,
        stripeUpdatedAt: 1_700_000_060_000,
      });
    });

    expect(await asUser.query(api.stripeCustomers.me, { asOf: NOVEMBER })).toEqual({
      status: "ready",
      card: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
    });
  });

  test("checks the card's expiry against the month the caller passes", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_me_expiry", "member");
    await t.run(async (ctx) => {
      await createStripeCustomer(ctx, companyId, {
        stripeCustomerId: "cus_company",
        stripeUpdatedAt: 1_700_000_000_000,
      });
      await savePaymentMethod(ctx, {
        stripeCustomerId: "cus_company",
        card: { ...visa, expMonth: 11, expYear: 2026 },
        stripeUpdatedAt: 1_700_000_060_000,
      });
    });

    const status = async (asOf: number) =>
      (await asUser.query(api.stripeCustomers.me, { asOf })).status;

    expect(await status(NOVEMBER)).toBe("ready");
    expect(await status(Date.UTC(2026, 11, 1))).toBe("expired");
  });

  test("refuses a creator", async () => {
    const t = convexTest(schema, modules);
    await seedCreatorId(t, "pm_me_creator");
    const asCreator = await seedUser(t, { subject: "pm_me_creator" });

    await expectApiError(
      () => asCreator.query(api.stripeCustomers.me, { asOf: NOVEMBER }),
      "forbidden",
    );
  });
});

describe("setupPaymentMethod", () => {
  test("creates the company's customer the first time and returns a card-only Checkout link", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_setup_new", "admin");

    const link = await asUser.action(api.stripeCustomers.setupPaymentMethod, {
      returnPath: "/payouts",
    });

    expect(link).toEqual({ url: CHECKOUT_URL });
    // No company name: a renamed company retrying must send the identical request,
    // or Stripe would treat it as new and create a second customer.
    expect(stripe.createCustomer).toHaveBeenCalledWith(
      { metadata: { companyId } },
      {
        idempotencyKey: expect.stringMatching(
          new RegExp(`^stripe-customer:${companyId}:[0-9a-f]{16}$`),
        ),
      },
    );
    expect(stripe.createSession).toHaveBeenCalledWith({
      mode: "setup",
      customer: "cus_new",
      currency: "usd",
      allowed_payment_method_types: ["card"],
      success_url: "http://localhost:3000/payouts?stripe=return",
      cancel_url: "http://localhost:3000/payouts?stripe=cancel",
      metadata: { companyId },
    });
    expect(await t.run((ctx) => getStripeCustomerByCompanyId(ctx, companyId))).toMatchObject({
      stripeCustomerId: "cus_new",
      stripeUpdatedAt: 1_700_000_000_000,
    });
    // Opening Checkout saves no card; the webhook does.
    expect(await asUser.query(api.stripeCustomers.me, { asOf: NOVEMBER })).toEqual({
      status: "missing",
      card: null,
    });
  });

  // Replacing a card goes through Checkout again on the same customer.
  test("reuses the stored customer instead of creating another", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_setup_again", "admin");
    await t.run((ctx) =>
      createStripeCustomer(ctx, companyId, {
        stripeCustomerId: "cus_existing",
        stripeUpdatedAt: 1_700_000_000_000,
      }),
    );

    await asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" });

    expect(stripe.createCustomer).not.toHaveBeenCalled();
    expect(stripe.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });

  // The admin comes back to the page they started from, with its own query intact.
  test("returns to the caller's page, keeping its query", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_setup_query", "admin");

    await asUser.action(api.stripeCustomers.setupPaymentMethod, {
      returnPath: "/campaigns/new?step=2",
    });

    expect(stripe.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "http://localhost:3000/campaigns/new?step=2&stripe=return",
        cancel_url: "http://localhost:3000/campaigns/new?step=2&stripe=cancel",
      }),
    );
  });

  // Otherwise the Checkout flow would redirect admins to a site of the caller's choosing.
  test.each([
    "https://evil.example/payouts",
    "//evil.example/payouts",
    "/\\evil.example",
    "payouts",
  ])("refuses a return path off the Tomoji site (%s) before calling Stripe", async (returnPath) => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_setup_offsite", "admin");

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath }),
      "invalid_state",
      "return_path_invalid",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
    expect(stripe.createSession).not.toHaveBeenCalled();
  });

  test("refuses a company member who is not an admin before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_setup_member", "member");

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "forbidden",
      "company_admin_required",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });

  test("refuses a creator before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    await seedCreatorId(t, "pm_setup_creator");
    const asCreator = await seedUser(t, { subject: "pm_setup_creator" });

    await expectApiError(
      () => asCreator.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "forbidden",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });

  test("refuses an operator before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "pm_setup_operator");

    await expectApiError(
      () => asOperator.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "forbidden",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });

  test("reports and logs a Stripe failure without saving a customer", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_setup_down", "admin");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createCustomer.mockRejectedValue(new Error("Stripe is down"));

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "upstream_failure",
      "stripe_customer_failed",
    );
    expect(logged).toHaveBeenCalledWith(
      "Stripe refused to create the customer",
      expect.objectContaining({ message: "Stripe is down" }),
    );
    expect(await t.run((ctx) => getStripeCustomerByCompanyId(ctx, companyId))).toBeNull();
  });

  // The customer exists now, so the next click must reuse it rather than create another.
  test("keeps the new customer when only Checkout fails", async () => {
    const t = convexTest(schema, modules);
    const { asUser, companyId } = await seedCompanyUser(t, "pm_setup_checkout_down", "admin");
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createSession.mockRejectedValue(new Error("Stripe is down"));

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "upstream_failure",
      "stripe_checkout_failed",
    );
    expect(await t.run((ctx) => getStripeCustomerByCompanyId(ctx, companyId))).toMatchObject({
      stripeCustomerId: "cus_new",
    });
  });

  test("fails loudly when the deployment has no site url", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_setup_no_site", "admin");
    vi.stubEnv("SITE_URL", "");

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "misconfigured",
      "site_url_missing",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });

  test("fails loudly when the deployment has no Stripe key", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCompanyUser(t, "pm_setup_no_key", "admin");
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await expectApiError(
      () => asUser.action(api.stripeCustomers.setupPaymentMethod, { returnPath: "/payouts" }),
      "misconfigured",
      "stripe_secret_key_missing",
    );
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });
});
