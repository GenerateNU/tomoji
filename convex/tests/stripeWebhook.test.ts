/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createStripeAccount,
  getStripeAccountByCreatorId,
  toStripeAccountStatus,
  type StripeAccountState,
} from "../models/stripeAccounts";
import schema from "../schema";
import { seedCreatorId, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "whsec_test_tomoji";

// The SDK exports no resource classes, so the prototype comes from a throwaway
// instance. Spying there intercepts every client the webhook builds.
const accounts = Object.getPrototypeOf(new Stripe("sk_test_tomoji").accounts);

/** The account as Stripe has it now, which the webhook reads instead of the event's copy. */
function currentAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct_creator",
    object: "account",
    details_submitted: true,
    payouts_enabled: true,
    requirements: { currently_due: [] },
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Account;
}

let retrieveAccount: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji");
  // The router also mounts AuthKit's routes, which read these when loaded.
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_API_KEY", "sk_test_tomoji");
  vi.stubEnv("WORKOS_WEBHOOK_SECRET", "workos_webhook_test");
  retrieveAccount = vi.spyOn(accounts, "retrieve").mockResolvedValue(currentAccount() as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const stored: StripeAccountState = {
  stripeAccountId: "acct_creator",
  detailsSubmitted: false,
  payoutsEnabled: false,
  requirementsDue: true,
  stripeUpdatedAt: 1_700_000_000_000,
};

/** An `account.updated` event as Stripe sends it; `created` is in seconds. */
function accountUpdated(account: Partial<Stripe.Account>, created = 1_700_000_100) {
  return JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "account.updated",
    created,
    data: {
      object: {
        id: "acct_creator",
        object: "account",
        details_submitted: true,
        payouts_enabled: true,
        requirements: { currently_due: [] },
        metadata: {},
        ...account,
      },
    },
  });
}

/** Posts a payload signed with `secret`, the way Stripe signs deliveries. */
async function deliver(t: TestConvex, payload: string, secret = SECRET) {
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return await t.fetch("/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": signature, "Content-Type": "application/json" },
    body: payload,
  });
}

async function seedStoredAccount(subject: string) {
  const t = convexTest(schema, modules);
  const creatorId = await seedCreatorId(t, subject);
  await t.run((ctx) => createStripeAccount(ctx, creatorId, stored));
  const account = () => t.run((ctx) => getStripeAccountByCreatorId(ctx, creatorId));
  return { t, creatorId, account };
}

/** An `account.application.deauthorized` event: the creator removed Tomoji in Stripe. */
function deauthorized(stripeAccountId: string, created = 1_700_000_200) {
  return JSON.stringify({
    id: "evt_deauthorized",
    object: "event",
    type: "account.application.deauthorized",
    created,
    // The connected account; `data.object` is Tomoji's application, not the account.
    account: stripeAccountId,
    data: { object: { id: "ca_tomoji", object: "application" } },
  });
}

describe("POST /stripe/webhook", () => {
  test("applies a verified account.updated event", async () => {
    const { t, account } = await seedStoredAccount("webhook_update");

    const response = await deliver(t, accountUpdated({}));

    expect(response.status).toBe(200);
    expect(retrieveAccount).toHaveBeenCalledWith("acct_creator");
    expect(await account()).toMatchObject({
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      stripeUpdatedAt: 1_700_000_100_000,
    });
  });

  // Two events in the same second can arrive in either order, and Stripe's
  // timestamps cannot tell them apart; the account as Stripe has it now can.
  test("saves the account as Stripe has it now, not the event's copy", async () => {
    const { t, account } = await seedStoredAccount("webhook_same_second");
    retrieveAccount.mockResolvedValue(
      currentAccount({
        payouts_enabled: false,
        requirements: { currently_due: ["document"] },
      }) as never,
    );

    await deliver(t, accountUpdated({ payouts_enabled: true }));

    expect(await account()).toMatchObject({ payoutsEnabled: false, requirementsDue: true });
  });

  // A disconnected account can no longer be read. Retrying would fail for days,
  // and the deauthorization event records the disconnect.
  test("acknowledges an update for an account Tomoji can no longer read", async () => {
    const { t, account } = await seedStoredAccount("webhook_no_access");
    vi.spyOn(console, "log").mockImplementation(() => {});
    retrieveAccount.mockRejectedValue(
      new Stripe.errors.StripePermissionError({
        type: "invalid_request_error",
        code: "account_invalid",
        message: "The provided key does not have access to account",
      }),
    );

    const response = await deliver(t, accountUpdated({}));

    expect(response.status).toBe(200);
    expect(await account()).toMatchObject(stored);
  });

  // A 500 makes Stripe redeliver, so the update is applied once Stripe recovers.
  test("asks Stripe to retry when the account cannot be fetched", async () => {
    const { t, account } = await seedStoredAccount("webhook_stripe_down");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    retrieveAccount.mockRejectedValue(new Error("Stripe is down"));

    const response = await deliver(t, accountUpdated({}));

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledWith(
      "Stripe refused the account",
      expect.objectContaining({ message: "Stripe is down" }),
    );
    expect(await account()).toMatchObject(stored);
  });

  test("marks the account disconnected when the creator removes Tomoji", async () => {
    const { t, account } = await seedStoredAccount("webhook_deauthorized");

    const response = await deliver(t, deauthorized("acct_creator"));

    expect(response.status).toBe(200);
    expect(await account()).toMatchObject({ disconnectedAt: 1_700_000_200_000 });
    expect(toStripeAccountStatus(await account())).toBe("disconnected");
  });

  // Stripe can deliver an older update after the disconnect.
  test("stays disconnected when an update arrives afterwards", async () => {
    const { t, account } = await seedStoredAccount("webhook_deauthorized_late");
    await deliver(t, deauthorized("acct_creator", 1_700_000_100));

    await deliver(t, accountUpdated({}, 1_700_000_300));

    expect(toStripeAccountStatus(await account())).toBe("disconnected");
  });

  test("acknowledges a disconnect for an account this deployment does not have", async () => {
    const { t, account } = await seedStoredAccount("webhook_deauthorized_other");

    const response = await deliver(t, deauthorized("acct_elsewhere"));

    expect(response.status).toBe(200);
    expect(await account()).not.toHaveProperty("disconnectedAt");
  });

  test("skips an event older than the stored state", async () => {
    const { t, account } = await seedStoredAccount("webhook_stale");

    const response = await deliver(t, accountUpdated({}, 1_699_999_000));

    expect(response.status).toBe(200);
    expect(await account()).toMatchObject(stored);
  });

  test("adopts an unsaved account tagged with one of our creators", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "webhook_adopt");
    retrieveAccount.mockResolvedValue(currentAccount({ metadata: { creatorId } }) as never);

    const response = await deliver(t, accountUpdated({ metadata: { creatorId } }));

    expect(response.status).toBe(200);
    expect(await t.run((ctx) => getStripeAccountByCreatorId(ctx, creatorId))).toMatchObject({
      stripeAccountId: "acct_creator",
      payoutsEnabled: true,
    });
  });

  // Other deployments' accounts arrive too; refusing them would make Stripe
  // retry for days.
  test("acknowledges an account from another deployment without storing it", async () => {
    const t = convexTest(schema, modules);
    const foreign = { id: "acct_elsewhere", metadata: { creatorId: "k57notours" } };
    retrieveAccount.mockResolvedValue(currentAccount(foreign) as never);

    const response = await deliver(t, accountUpdated(foreign));

    expect(response.status).toBe(200);
    expect(await t.run((ctx) => ctx.db.query("stripeAccounts").first())).toBeNull();
  });

  test("acknowledges event types it does not handle", async () => {
    const { t, account } = await seedStoredAccount("webhook_other");
    const payload = JSON.stringify({
      id: "evt_other",
      object: "event",
      type: "payout.paid",
      created: 1_700_000_100,
      data: { object: { id: "po_test", object: "payout" } },
    });

    const response = await deliver(t, payload);

    expect(response.status).toBe(200);
    expect(await account()).toMatchObject(stored);
  });

  test("rejects an event signed with a different secret", async () => {
    const { t, account } = await seedStoredAccount("webhook_forged");

    const response = await deliver(t, accountUpdated({}), "whsec_someone_else");

    expect(response.status).toBe(400);
    expect(await account()).toMatchObject(stored);
  });

  test("rejects a request without a signature", async () => {
    const { t, account } = await seedStoredAccount("webhook_unsigned");

    const response = await t.fetch("/stripe/webhook", {
      method: "POST",
      body: accountUpdated({}),
    });

    expect(response.status).toBe(400);
    expect(await account()).toMatchObject(stored);
  });

  // A 500 makes Stripe retry, so events are not lost while the secret is fixed.
  test("fails without applying anything when the deployment has no signing secret", async () => {
    const { t, account } = await seedStoredAccount("webhook_no_secret");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const response = await deliver(t, accountUpdated({}));

    expect(response.status).toBe(500);
    expect(await account()).toMatchObject(stored);
  });
});
