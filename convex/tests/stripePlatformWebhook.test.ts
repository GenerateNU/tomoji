/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createStripeCustomer,
  getStripeCustomerByCompanyId,
  savePaymentMethod,
} from "../models/stripeCustomers";
import schema from "../schema";
import { seedMembership, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "whsec_platform_test";
const CUSTOMER_CREATED_AT = 1_700_000_000_000;

// The SDK exports no resource classes, so the prototype comes from a throwaway
// instance. Spying there intercepts every client the webhook builds.
const client = new Stripe("sk_test_tomoji");
const setupIntents = Object.getPrototypeOf(client.setupIntents);
const paymentMethods = Object.getPrototypeOf(client.paymentMethods);

/** The card as Stripe returns it on a payment method. */
const stripeCard = {
  brand: "visa",
  display_brand: "visa",
  last4: "4242",
  exp_month: 8,
  exp_year: 2028,
};

let retrieveSetupIntent: ReturnType<typeof vi.spyOn>;
let retrievePaymentMethod: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("STRIPE_PLATFORM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji");
  // The router also mounts AuthKit's routes, which read these when loaded.
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_API_KEY", "sk_test_tomoji");
  vi.stubEnv("WORKOS_WEBHOOK_SECRET", "workos_webhook_test");
  retrieveSetupIntent = vi.spyOn(setupIntents, "retrieve").mockResolvedValue({
    id: "seti_test",
    object: "setup_intent",
    payment_method: { id: "pm_visa", object: "payment_method", card: stripeCard },
  } as never);
  // The renewed card as Stripe has it now.
  retrievePaymentMethod = vi.spyOn(paymentMethods, "retrieve").mockResolvedValue({
    id: "pm_visa",
    object: "payment_method",
    customer: "cus_company",
    card: { ...stripeCard, exp_year: 2031 },
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** An event as Stripe sends it; `created` is in seconds. */
function event(type: string, object: Record<string, unknown>, created = 1_700_000_100) {
  return JSON.stringify({ id: "evt_test", object: "event", type, created, data: { object } });
}

function checkoutCompleted(session: Record<string, unknown> = {}, created?: number) {
  return event(
    "checkout.session.completed",
    {
      id: "cs_test",
      object: "checkout.session",
      mode: "setup",
      customer: "cus_company",
      setup_intent: "seti_test",
      ...session,
    },
    created,
  );
}

function cardUpdated(paymentMethod: Record<string, unknown> = {}) {
  return event("payment_method.automatically_updated", {
    id: "pm_visa",
    object: "payment_method",
    customer: "cus_company",
    card: { ...stripeCard, exp_year: 2031 },
    ...paymentMethod,
  });
}

/** Posts a payload signed with `secret`, the way Stripe signs deliveries. */
async function deliver(t: TestConvex, payload: string, secret = SECRET) {
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return await t.fetch("/stripe/webhook/platform", {
    method: "POST",
    headers: { "Stripe-Signature": signature, "Content-Type": "application/json" },
    body: payload,
  });
}

/** A company whose admin has opened Checkout, so its customer exists without a card. */
async function seedCustomer(subject: string) {
  const t = convexTest(schema, modules);
  const { membership } = await seedMembership(t, subject, `org_${subject}`, "admin");
  await t.run((ctx) =>
    createStripeCustomer(ctx, membership.companyId, {
      stripeCustomerId: "cus_company",
      stripeUpdatedAt: CUSTOMER_CREATED_AT,
    }),
  );
  const customer = () => t.run((ctx) => getStripeCustomerByCompanyId(ctx, membership.companyId));
  return { t, customer };
}

const savedVisa = {
  stripeCustomerId: "cus_company",
  card: { paymentMethodId: "pm_visa", brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
  stripeUpdatedAt: CUSTOMER_CREATED_AT + 60_000,
};

describe("POST /stripe/webhook/platform", () => {
  describe("checkout.session.completed", () => {
    test("saves the card from a completed setup session", async () => {
      const { t, customer } = await seedCustomer("platform_saved");

      const response = await deliver(t, checkoutCompleted());

      expect(response.status).toBe(200);
      expect(retrieveSetupIntent).toHaveBeenCalledWith("seti_test", {
        expand: ["payment_method"],
      });
      expect(await customer()).toMatchObject({
        card: {
          paymentMethodId: "pm_visa",
          brand: "visa",
          last4: "4242",
          expMonth: 8,
          expYear: 2028,
        },
        stripeUpdatedAt: 1_700_000_100_000,
      });
    });

    // Co-branded cards show the brand the cardholder chose, as Stripe recommends.
    test("prefers the brand Stripe displays over the network brand", async () => {
      const { t, customer } = await seedCustomer("platform_display_brand");
      retrieveSetupIntent.mockResolvedValue({
        id: "seti_test",
        payment_method: {
          id: "pm_cb",
          card: { ...stripeCard, brand: "visa", display_brand: "cartes_bancaires" },
        },
      } as never);

      await deliver(t, checkoutCompleted());

      expect((await customer())?.card?.brand).toBe("cartes_bancaires");
    });

    test("falls back to the network brand when Stripe displays none", async () => {
      const { t, customer } = await seedCustomer("platform_no_display_brand");
      retrieveSetupIntent.mockResolvedValue({
        id: "seti_test",
        payment_method: { id: "pm_visa", card: { ...stripeCard, display_brand: null } },
      } as never);

      await deliver(t, checkoutCompleted());

      expect((await customer())?.card?.brand).toBe("visa");
    });

    // Payment-mode sessions belong to other features; this webhook saves cards only.
    test("ignores a session that is not in setup mode", async () => {
      const { t, customer } = await seedCustomer("platform_payment_mode");

      const response = await deliver(t, checkoutCompleted({ mode: "payment", setup_intent: null }));

      expect(response.status).toBe(200);
      expect(retrieveSetupIntent).not.toHaveBeenCalled();
      expect((await customer())?.card).toBeUndefined();
    });

    // Other deployments share the Stripe sandbox and receive each other's events.
    test("acknowledges a customer from another deployment without storing anything", async () => {
      const t = convexTest(schema, modules);

      const response = await deliver(t, checkoutCompleted({ customer: "cus_elsewhere" }));

      expect(response.status).toBe(200);
      expect(await t.run((ctx) => ctx.db.query("stripeCustomers").first())).toBeNull();
    });

    // A 500 makes Stripe redeliver, so the card is saved once Stripe recovers.
    test("asks Stripe to retry when the card cannot be fetched", async () => {
      const { t, customer } = await seedCustomer("platform_retrieve_down");
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      retrieveSetupIntent.mockRejectedValue(new Error("Stripe is down"));

      const response = await deliver(t, checkoutCompleted());

      expect(response.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(
        "Stripe refused the SetupIntent",
        expect.objectContaining({ message: "Stripe is down" }),
      );
      expect((await customer())?.card).toBeUndefined();
    });
  });

  describe("payment_method.automatically_updated", () => {
    test("refreshes the expiry of the company's current card", async () => {
      const { t, customer } = await seedCustomer("platform_renewed");
      await t.run((ctx) => savePaymentMethod(ctx, savedVisa));

      const response = await deliver(t, cardUpdated());

      expect(response.status).toBe(200);
      expect(retrievePaymentMethod).toHaveBeenCalledWith("pm_visa");
      expect((await customer())?.card).toMatchObject({ paymentMethodId: "pm_visa", expYear: 2031 });
      expect(retrieveSetupIntent).not.toHaveBeenCalled();
    });

    // Two updates in the same second can arrive in either order, and Stripe's
    // timestamps cannot tell them apart; the card as Stripe has it now can.
    test("saves the card as Stripe has it now, not the event's copy", async () => {
      const { t, customer } = await seedCustomer("platform_reordered");
      await t.run((ctx) => savePaymentMethod(ctx, savedVisa));

      await deliver(t, cardUpdated({ card: { ...stripeCard, exp_year: 2029 } }));

      expect((await customer())?.card).toMatchObject({ expYear: 2031 });
    });

    test("leaves the saved card alone when a replaced card is updated", async () => {
      const { t, customer } = await seedCustomer("platform_replaced");
      await t.run((ctx) => savePaymentMethod(ctx, savedVisa));
      retrievePaymentMethod.mockResolvedValue({
        id: "pm_old",
        customer: "cus_company",
        card: { ...stripeCard, last4: "1111" },
      } as never);

      const response = await deliver(t, cardUpdated({ id: "pm_old" }));

      expect(response.status).toBe(200);
      expect((await customer())?.card).toMatchObject(savedVisa.card);
    });

    // A 500 makes Stripe redeliver, so the new expiry is saved once Stripe recovers.
    test("asks Stripe to retry when the card cannot be fetched", async () => {
      const { t, customer } = await seedCustomer("platform_refresh_down");
      await t.run((ctx) => savePaymentMethod(ctx, savedVisa));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      retrievePaymentMethod.mockRejectedValue(new Error("Stripe is down"));

      const response = await deliver(t, cardUpdated());

      expect(response.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(
        "Stripe refused the payment method",
        expect.objectContaining({ message: "Stripe is down" }),
      );
      expect((await customer())?.card).toMatchObject(savedVisa.card);
    });
  });

  test("acknowledges event types it does not handle", async () => {
    const { t, customer } = await seedCustomer("platform_other");

    const response = await deliver(t, event("customer.created", { id: "cus_company" }));

    expect(response.status).toBe(200);
    expect((await customer())?.card).toBeUndefined();
  });

  // Connect events are signed with the other destination's secret.
  test("rejects an event signed with a different secret", async () => {
    const { t, customer } = await seedCustomer("platform_forged");

    const response = await deliver(t, checkoutCompleted(), "whsec_someone_else");

    expect(response.status).toBe(400);
    expect((await customer())?.card).toBeUndefined();
  });

  test("rejects a request without a signature", async () => {
    const { t, customer } = await seedCustomer("platform_unsigned");

    const response = await t.fetch("/stripe/webhook/platform", {
      method: "POST",
      body: checkoutCompleted(),
    });

    expect(response.status).toBe(400);
    expect((await customer())?.card).toBeUndefined();
  });

  test("fails without applying anything when the deployment has no signing secret", async () => {
    const { t, customer } = await seedCustomer("platform_no_secret");
    vi.stubEnv("STRIPE_PLATFORM_WEBHOOK_SECRET", "");

    const response = await deliver(t, checkoutCompleted());

    expect(response.status).toBe(500);
    expect((await customer())?.card).toBeUndefined();
  });
});
