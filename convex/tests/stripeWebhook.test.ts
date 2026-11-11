/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createStripeAccount,
  getStripeAccountByCreatorId,
  type StripeAccountState,
} from "../models/stripeAccounts";
import schema from "../schema";
import { seedCreatorId, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "whsec_test_tomoji";

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  // The router also mounts AuthKit's routes, which read these when loaded.
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_API_KEY", "sk_test_tomoji");
  vi.stubEnv("WORKOS_WEBHOOK_SECRET", "workos_webhook_test");
});
afterEach(() => vi.unstubAllEnvs());

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

describe("POST /stripe/webhook", () => {
  test("applies a verified account.updated event", async () => {
    const { t, account } = await seedStoredAccount("webhook_update");

    const response = await deliver(t, accountUpdated({}));

    expect(response.status).toBe(200);
    expect(await account()).toMatchObject({
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      stripeUpdatedAt: 1_700_000_100_000,
    });
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

    const response = await deliver(
      t,
      accountUpdated({ id: "acct_elsewhere", metadata: { creatorId: "k57notours" } }),
    );

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
