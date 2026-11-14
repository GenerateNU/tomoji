/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import {
  createStripeAccount,
  disconnectStripeAccount,
  type StripeAccountState,
} from "../models/stripeAccounts";
import type { Id } from "../_generated/dataModel";
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
    requirements: {
      currently_due: ["individual.first_name", "external_account"],
    },
    ...overrides,
  } as Stripe.Account;
}

/** What `accounts.list` resolves to: iterable across pages, as the SDK's list is. */
function listOf(items: Stripe.Account[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

function stubStripe() {
  return {
    createAccount: vi.spyOn(accounts, "create").mockResolvedValue(stripeAccount() as never),
    listAccounts: vi.spyOn(accounts, "list").mockReturnValue(listOf([]) as never),
    createAccountLink: vi.spyOn(accountLinks, "create").mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_new/link",
    } as never),
  };
}

const controller = {
  stripe_dashboard: { type: "full" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
};

/** The keys Stripe received for each account creation, in order. */
function idempotencyKeys() {
  return stripe.createAccount.mock.calls.map(
    ([, options]) => (options as Stripe.RequestOptions).idempotencyKey,
  );
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

/**
 * Seeds a creator living in `country` (none if null), optionally with a stored
 * Stripe account, and signs in as them.
 */
async function seedCreator(
  t: TestConvex,
  subject: string,
  state?: StripeAccountState,
  country: string | null = "US",
) {
  const creatorId = await seedCreatorId(t, subject);
  await setCountry(t, creatorId, country);
  if (state) await t.run((ctx) => createStripeAccount(ctx, creatorId, state));
  return { creatorId, asCreator: await seedUser(t, { subject }) };
}

async function setCountry(t: TestConvex, creatorId: Id<"creators">, country: string | null) {
  await t.run((ctx) =>
    ctx.db.patch("creators", creatorId, {
      countryOfResidence: country ?? undefined,
    }),
  );
}

describe("me", () => {
  test("reports notStarted before the creator has a Stripe account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_me_new");

    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "notStarted",
    });
  });

  test("reports the status derived from the stored account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_me_ready", submitted);

    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "ready",
    });
  });

  test("reports disconnected once the creator removes Tomoji in Stripe", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_me_gone", submitted);
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_existing", 1_700_000_100_000));

    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "disconnected",
    });
  });

  test("refuses a company user", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "stripe_me_company",
      org: { id: "org_acme" },
    });

    await expectApiError(() => asCompany.query(api.stripeAccounts.me, {}), "forbidden");
  });
});

describe("onboardingLink", () => {
  test("creates a Standard account the first time and returns its onboarding link", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(t, "stripe_onboard_new");

    const link = await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(link).toEqual({
      url: "https://connect.stripe.com/setup/e/acct_new/link",
    });
    // Exact, because Stripe rejects Standard accounts that request `transfers`
    // on its own; it picks their capabilities by country. No email: nothing that
    // can change between a failed attempt and its retry.
    expect(stripe.createAccount).toHaveBeenCalledWith(
      { country: "US", controller, metadata: { creatorId } },
      {
        idempotencyKey: expect.stringMatching(
          new RegExp(`^stripe-account:${creatorId}:[^:]+:[0-9a-f]{16}$`),
        ),
      },
    );
    // A first attempt has nothing to recover.
    expect(stripe.listAccounts).not.toHaveBeenCalled();
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
    const asCompany = await seedUser(t, {
      subject: "stripe_onboard_co",
      org: { id: "org_acme" },
    });

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
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "notStarted",
    });
  });

  // A double click must reach Stripe with one key, so it returns one account.
  test("retries an identical request under the same idempotency key", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_retry");
    stripe.createAccount.mockRejectedValueOnce(new Error("Stripe is down"));

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    const [first, second] = idempotencyKeys();
    expect(second).toBe(first);
  });

  // Stripe may have created the account before the first attempt failed. A
  // different request would make it create a second one.
  test("retries with the original country even if the profile changed", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(t, "stripe_onboard_moved");
    stripe.createAccount.mockRejectedValueOnce(new Error("Stripe is down"));

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    await setCountry(t, creatorId, "CA");
    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    const [first, second] = stripe.createAccount.mock.calls;
    expect(second[0]).toEqual(first[0]);
    expect(second[1]).toEqual(first[1]);
  });

  // Stripe forgets idempotency keys after 24 hours, so a late retry would make a
  // second account; the one it already made carries our creator tag.
  test("recovers the account Stripe made before a failed save instead of creating another", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(t, "stripe_onboard_recover");
    stripe.createAccount.mockRejectedValueOnce(new Error("Network dropped"));
    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    stripe.listAccounts.mockReturnValue(
      listOf([
        stripeAccount({
          id: "acct_someone_else",
          metadata: { creatorId: "k57other" },
        }),
        stripeAccount({ id: "acct_made_earlier", metadata: { creatorId } }),
      ]) as never,
    );

    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).toHaveBeenCalledTimes(1);
    // No upper bound: Stripe may have created the account well after the attempt
    // started, and a retry can come hours later.
    expect(stripe.listAccounts).toHaveBeenCalledWith({
      created: { gte: expect.any(Number) },
      limit: 100,
    });
    expect(stripe.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_made_earlier" }),
    );
  });

  test("creates the account in the creator's country", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_ca", undefined, "CA");

    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ country: "CA" }),
      expect.anything(),
    );
  });

  // Stripe fixes an account's country forever, so it is never guessed.
  test("refuses a creator without a country before calling Stripe", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_nowhere", undefined, null);

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "invalid_state",
      "country_required",
    );
    expect(stripe.createAccount).not.toHaveBeenCalled();
  });

  test("reports a country Stripe does not support and lets the creator change it", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(t, "stripe_onboard_ng", undefined, "NG");
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "country_unsupported",
        param: "country",
        message: "NG is not currently supported by Stripe.",
      }),
    );

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "invalid_state",
      "stripe_country_unsupported",
    );
    await setCountry(t, creatorId, "GB");
    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).toHaveBeenLastCalledWith(
      expect.objectContaining({ country: "GB" }),
      expect.anything(),
    );
  });

  // A failed lookup cannot prove no account exists; creating one could make a
  // duplicate once Stripe has forgotten the original key.
  test("stops without creating when the recovery lookup fails", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_lookup_down");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValueOnce(new Error("Network dropped"));
    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    stripe.listAccounts.mockImplementation(() => {
      throw new Error("Stripe is down");
    });

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );

    expect(stripe.createAccount).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "Stripe refused to list accounts",
      expect.objectContaining({ message: "Stripe is down" }),
    );
    // The attempt is kept, so the next retry repeats the same request.
    stripe.listAccounts.mockReturnValue(listOf([]) as never);
    await asCreator.action(api.stripeAccounts.onboardingLink, {});
    const [first, second] = idempotencyKeys();
    expect(second).toBe(first);
  });

  // Any invalid-request refusal proves Stripe made no account, so the retry may
  // start a fresh attempt. Reusing the key would replay the same refusal for 24 hours.
  test("starts a fresh attempt after Stripe rejects the request", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_rejected");
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "parameter_invalid_empty",
        message: "You passed an empty string for 'controller'.",
      }),
    );

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    const [first, second] = idempotencyKeys();
    expect(second).not.toBe(first);
    // A fresh attempt has nothing earlier to recover.
    expect(stripe.listAccounts).not.toHaveBeenCalled();
  });

  // A network error leaves it unknown whether Stripe made the account, so the
  // retry must repeat the same attempt and key.
  test("keeps the attempt after an error that may have created the account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_ambiguous");
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" }),
    );

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    const [first, second] = idempotencyKeys();
    expect(second).toBe(first);
  });

  // Reconnecting soon after connecting puts the old account inside the lookup's
  // window. Tomoji has lost access to it, so it must never be taken as the new one.
  test("does not recover the disconnected account being replaced", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, asCreator } = await seedCreator(
      t,
      "stripe_onboard_reconnect_soon",
      submitted,
    );
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_existing", 1_700_000_100_000));
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValueOnce(new Error("Network dropped"));
    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    stripe.listAccounts.mockReturnValue(
      listOf([stripeAccount({ id: "acct_existing", metadata: { creatorId } })]) as never,
    );

    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).toHaveBeenCalledTimes(2);
    expect(stripe.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_new" }),
    );
  });

  // Stripe refusing access proves the creator removed Tomoji, even if the
  // disconnect event never arrived; without this they could never reconnect.
  test("marks the account disconnected when Stripe refuses access to it", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_no_access", submitted);
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccountLink.mockRejectedValueOnce(
      new Stripe.errors.StripePermissionError({
        type: "invalid_request_error",
        code: "account_invalid",
        message: "The provided key does not have access to account",
      }),
    );

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "invalid_state",
      "stripe_account_disconnected",
    );
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "disconnected",
    });

    // The next click reconnects with a new account.
    await asCreator.action(api.stripeAccounts.onboardingLink, {});
    expect(stripe.createAccount).toHaveBeenCalledTimes(1);
  });

  // The old account is gone for good; reconnecting means a new one.
  test("creates a new account for a creator who disconnected Tomoji", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_reconnect", submitted);
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_existing", 1_700_000_100_000));

    await asCreator.action(api.stripeAccounts.onboardingLink, {});

    expect(stripe.createAccount).toHaveBeenCalledTimes(1);
    expect(stripe.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_new" }),
    );
    expect(await asCreator.query(api.stripeAccounts.me, {})).toEqual({
      status: "actionRequired",
    });
  });

  // The caller only sees `stripe_account_failed`; the log keeps Stripe's reason.
  test("logs Stripe's reason when it refuses the account", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedCreator(t, "stripe_onboard_refused");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createAccount.mockRejectedValue(new Error("You cannot request `transfers`"));

    await expectApiError(
      () => asCreator.action(api.stripeAccounts.onboardingLink, {}),
      "upstream_failure",
      "stripe_account_failed",
    );
    expect(logged).toHaveBeenCalledWith(
      "Stripe refused to create the account",
      expect.objectContaining({ message: "You cannot request `transfers`" }),
    );
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
