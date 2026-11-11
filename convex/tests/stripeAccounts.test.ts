/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { createStripeAccount, type StripeAccountState } from "../models/stripeAccounts";
import schema from "../schema";
import { expectApiError, seedCreatorId, seedOperator, seedUser, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

// The SDK exports no resource classes, so the prototypes come from a throwaway
// instance. Spying there intercepts every client the routes build.
const client = new Stripe("sk_test_tomoji");
const accounts = Object.getPrototypeOf(client.accounts);
const accountLinks = Object.getPrototypeOf(client.accountLinks);

/** The parts of a Stripe account the routes read, as a fresh account has them. */
function stripeAccount(overrides: Partial<Stripe.Account> = {}) {
  return {
    id: "acct_new",
    object: "account",
    created: 1_700_000_000,
    details_submitted: false,
    payouts_enabled: false,
    requirements: { currently_due: ["individual.first_name", "external_account"] },
    ...overrides,
  } as Stripe.Account;
}

function stubStripe() {
  return {
    createAccount: vi.spyOn(accounts, "create").mockResolvedValue(stripeAccount() as never),
    createAccountLink: vi
      .spyOn(accountLinks, "create")
      .mockResolvedValue({ url: "https://connect.stripe.com/setup/e/acct_new/link" } as never),
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

const submitted: StripeAccountState = {
  stripeAccountId: "acct_existing",
  detailsSubmitted: true,
  payoutsEnabled: true,
  requirementsDue: false,
  stripeUpdatedAt: 1_700_000_000_000,
};

/** Seeds a creator, optionally with a stored Stripe account, and signs in as them. */
async function seedCreator(t: TestConvex, subject: string, state?: StripeAccountState) {
  const creatorId = await seedCreatorId(t, subject);
  if (state) await t.run((ctx) => createStripeAccount(ctx, creatorId, state));
  return { creatorId, asCreator: await seedUser(t, { subject }) };
}

describe("me", () => {
  test("reports notStarted before the creator has a Stripe account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_me_new");

    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({ status: "notStarted" });
  });

  test("reports the status derived from the stored account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_me_ready", submitted);

    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({ status: "ready" });
  });

  test("refuses a company user", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "stripe_me_company", org: { id: "org_acme" } });

    await expectApiError(() => asCompany.query(api.stripeAccounts.me, {}), "forbidden");
  });
});

describe("onboardingLink", () => {
  test("creates a Standard account the first time and returns its onboarding link", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(t, "stripe_onboard_new");

    const link = await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(link).toEqual({ url: "https://connect.stripe.com/setup/e/acct_new/link" });
    expect(stripe.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "US",
        email: "stripe_onboard_new@example.com",
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        capabilities: { transfers: { requested: true } },
        metadata: { creatorId },
      }),
      { idempotencyKey: `stripe-account:${creatorId}` },
    );
    expect(stripe.createAccountLink).toHaveBeenCalledWith({
      account: "acct_new",
      type: "account_onboarding",
      return_url: "http://localhost:3000/profile?stripe=return",
      refresh_url: "http://localhost:3000/profile?stripe=refresh",
    });
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "actionRequired",
    });
  });

  test("reuses the stored account instead of creating another", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_again", {
      ...submitted,
      payoutsEnabled: false,
      requirementsDue: true,
    });

    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).not.toHaveBeenCalled();
    expect(stripe.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" }),
    );
  });

  test("refuses a company user before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "stripe_onboard_co", org: { id: "org_acme" } });

    await expectApiError(
      () => asCompany.action(api.stripeAccounts.onboardingLink, {}),
      "forbidden",
    );
    expect(stripe.createAccount).not.toHaveBeenCalled();
  });

  test("refuses an operator before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "stripe_onboard_operator");

    await expectApiError(
      () => asOperator.action(api.stripeAccounts.onboardingLink, {}),
      "forbidden",
    );
    expect(stripe.createAccount).not.toHaveBeenCalled();
  });

  test("reports a Stripe failure without saving an account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_down");
    stripe.createAccount.mockRejectedValue(new Error("Stripe is down"));

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({ status: "notStarted" });
  });

  // The account exists now, so the next click must reuse it rather than
  // create another.
  test("keeps the new account when only the link fails", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_link_down");
    stripe.createAccountLink.mockRejectedValue(new Error("Stripe is down"));

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_link_failed",
    );
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "actionRequired",
    });
  });

  test("fails loudly when the deployment has no site url", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_no_site");
    vi.stubEnv("SITE_URL", "");

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "misconfigured",
      "site_url_missing",
    );
    expect(stripe.createAccount).not.toHaveBeenCalled();
  });

  test("fails loudly when the deployment has no Stripe key", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_no_key");
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "misconfigured",
      "stripe_secret_key_missing",
    );
    expect(stripe.createAccount).not.toHaveBeenCalled();
  });
});
