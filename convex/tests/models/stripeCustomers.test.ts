/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  createStripeCustomer,
  getStripeCustomerByCompanyId,
  getStripeCustomerByStripeId,
  refreshCard,
  savePaymentMethod,
  toPaymentMethodStatus,
  type SavedPaymentMethod,
} from "../../models/stripeCustomers";
import schema from "../../schema";
import type { Doc } from "../../_generated/dataModel";
import { expectApiError, seedMembership, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const CUSTOMER_CREATED_AT = 1_700_000_000_000;

const visa: SavedPaymentMethod = {
  stripeCustomerId: "cus_company",
  card: { paymentMethodId: "pm_visa", brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
  stripeUpdatedAt: CUSTOMER_CREATED_AT + 60_000,
};

async function seedCompanyId(t: TestConvex, subject: string) {
  const { membership } = await seedMembership(t, subject, `org_${subject}`, "admin");
  return membership.companyId;
}

async function seedCustomer(subject: string) {
  const t = convexTest(schema, modules);
  const companyId = await seedCompanyId(t, subject);
  await t.run((ctx) =>
    createStripeCustomer(ctx, companyId, {
      stripeCustomerId: "cus_company",
      stripeUpdatedAt: CUSTOMER_CREATED_AT,
    }),
  );
  const customer = () => t.run((ctx) => getStripeCustomerByCompanyId(ctx, companyId));
  return { t, companyId, customer };
}

describe("toPaymentMethodStatus", () => {
  // Mid-November 2026, in UTC.
  const NOW = Date.UTC(2026, 10, 14);

  test("is missing before the company has a Stripe customer", () => {
    expect(toPaymentMethodStatus(null, NOW)).toEqual({ status: "missing", card: null });
  });

  // The customer exists as soon as an admin opens Checkout, before any card.
  test("is missing while the customer has no saved card", () => {
    const row = { stripeCustomerId: "cus_company" } as Doc<"stripeCustomers">;

    expect(toPaymentMethodStatus(row, NOW)).toEqual({ status: "missing", card: null });
  });

  // Brand, last 4, and expiry let the company recognize the card; Stripe's id stays server-side.
  test("is ready with the card to display once one is saved", () => {
    const row = { ...visa } as Doc<"stripeCustomers">;

    expect(toPaymentMethodStatus(row, NOW)).toEqual({
      status: "ready",
      card: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
    });
  });

  // A saved card past its expiry would only be declined; the company needs to replace it.
  test("is expired once the card's expiry month has passed", () => {
    const row = { ...visa, card: { ...visa.card, expMonth: 10, expYear: 2026 } };

    expect(toPaymentMethodStatus(row as Doc<"stripeCustomers">, NOW)).toEqual({
      status: "expired",
      card: { brand: "visa", last4: "4242", expMonth: 10, expYear: 2026 },
    });
  });

  // Cards work through the last day of their expiry month.
  test("is still ready during the card's expiry month", () => {
    const row = { ...visa, card: { ...visa.card, expMonth: 11, expYear: 2026 } };

    expect(toPaymentMethodStatus(row as Doc<"stripeCustomers">, NOW).status).toBe("ready");
  });
});

describe("createStripeCustomer", () => {
  test("records the company's customer without a card", async () => {
    const { t, companyId, customer } = await seedCustomer("customer_create");

    expect(await customer()).toMatchObject({
      companyId,
      stripeCustomerId: "cus_company",
      stripeUpdatedAt: CUSTOMER_CREATED_AT,
    });
    expect(await t.run((ctx) => getStripeCustomerByStripeId(ctx, "cus_company"))).toMatchObject({
      companyId,
    });
    expect((await customer())?.card).toBeUndefined();
  });

  // Concurrent setup requests share an idempotency key, so Stripe returns one customer.
  test("returns the existing row when the same customer is saved again", async () => {
    const { t, companyId, customer } = await seedCustomer("customer_again");
    const first = await customer();

    const again = await t.run((ctx) =>
      createStripeCustomer(ctx, companyId, {
        stripeCustomerId: "cus_company",
        stripeUpdatedAt: CUSTOMER_CREATED_AT,
      }),
    );

    expect(again._id).toBe(first?._id);
  });

  test("refuses a second, different customer for the same company", async () => {
    const { t, companyId } = await seedCustomer("customer_conflict");

    await expectApiError(
      () =>
        t.run((ctx) =>
          createStripeCustomer(ctx, companyId, {
            stripeCustomerId: "cus_other",
            stripeUpdatedAt: CUSTOMER_CREATED_AT,
          }),
        ),
      "conflict",
      "stripe_customer_exists",
    );
  });

  test("refuses a company that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompanyId(t, "customer_gone");
    await t.run((ctx) => ctx.db.delete("companies", companyId));

    await expectApiError(
      () =>
        t.run((ctx) =>
          createStripeCustomer(ctx, companyId, {
            stripeCustomerId: "cus_company",
            stripeUpdatedAt: CUSTOMER_CREATED_AT,
          }),
        ),
      "not_found",
    );
  });
});

describe("savePaymentMethod", () => {
  test("saves the card on the company's customer", async () => {
    const { t, customer } = await seedCustomer("card_save");

    expect(await t.run((ctx) => savePaymentMethod(ctx, visa))).toBe("updated");
    expect(await customer()).toMatchObject(visa);
  });

  test("replaces an earlier card with a newer one", async () => {
    const { t, customer } = await seedCustomer("card_replace");
    await t.run((ctx) => savePaymentMethod(ctx, visa));
    const mastercard: SavedPaymentMethod = {
      ...visa,
      card: {
        paymentMethodId: "pm_mastercard",
        brand: "mastercard",
        last4: "4444",
        expMonth: 1,
        expYear: 2030,
      },
      stripeUpdatedAt: visa.stripeUpdatedAt + 60_000,
    };

    expect(await t.run((ctx) => savePaymentMethod(ctx, mastercard))).toBe("updated");
    expect(await customer()).toMatchObject(mastercard);
  });

  // Stripe delivers events out of order; a late event for the old card must not win.
  test("skips a card older than the one saved", async () => {
    const { t, customer } = await seedCustomer("card_stale");
    await t.run((ctx) => savePaymentMethod(ctx, visa));

    const older: SavedPaymentMethod = {
      ...visa,
      card: { ...visa.card, paymentMethodId: "pm_old" },
      stripeUpdatedAt: visa.stripeUpdatedAt - 1,
    };

    expect(await t.run((ctx) => savePaymentMethod(ctx, older))).toBe("stale");
    expect(await customer()).toMatchObject(visa);
  });

  // Other deployments share the Stripe sandbox and receive each other's events.
  test("ignores a customer this deployment does not have", async () => {
    const t = convexTest(schema, modules);

    expect(
      await t.run((ctx) => savePaymentMethod(ctx, { ...visa, stripeCustomerId: "cus_elsewhere" })),
    ).toBe("unknown");
    expect(await t.run((ctx) => ctx.db.query("stripeCustomers").first())).toBeNull();
  });
});

describe("refreshCard", () => {
  // The card network sends a renewed card's new expiry; the card itself stays the same.
  const renewed: SavedPaymentMethod = {
    ...visa,
    card: { ...visa.card, expMonth: 8, expYear: 2031 },
    stripeUpdatedAt: visa.stripeUpdatedAt + 60_000,
  };

  test("updates the expiry of the company's current card", async () => {
    const { t, customer } = await seedCustomer("refresh_current");
    await t.run((ctx) => savePaymentMethod(ctx, visa));

    expect(await t.run((ctx) => refreshCard(ctx, renewed))).toBe("updated");
    expect(await customer()).toMatchObject({
      card: renewed.card,
      // A renewal changes the card's details, not which card was chosen or when.
      stripeUpdatedAt: visa.stripeUpdatedAt,
    });
  });

  // Stripe keeps updating a detached card; it must not come back as the company's card.
  test("ignores a card the company has since replaced", async () => {
    const { t, customer } = await seedCustomer("refresh_replaced");
    await t.run((ctx) => savePaymentMethod(ctx, visa));

    const oldCard = { ...renewed, card: { ...renewed.card, paymentMethodId: "pm_old" } };

    expect(await t.run((ctx) => refreshCard(ctx, oldCard))).toBe("replaced");
    expect(await customer()).toMatchObject(visa);
  });

  test("ignores a card when the company has none saved", async () => {
    const { t, customer } = await seedCustomer("refresh_none");

    expect(await t.run((ctx) => refreshCard(ctx, renewed))).toBe("replaced");
    expect((await customer())?.card).toBeUndefined();
  });

  // A renewal stamped after a new card's Checkout must not make that new card look stale.
  test("does not stop a newer card from replacing the renewed one", async () => {
    const { t, customer } = await seedCustomer("refresh_then_new");
    await t.run((ctx) => savePaymentMethod(ctx, visa));
    await t.run((ctx) =>
      refreshCard(ctx, { ...renewed, stripeUpdatedAt: visa.stripeUpdatedAt + 300_000 }),
    );
    const mastercard: SavedPaymentMethod = {
      stripeCustomerId: "cus_company",
      card: {
        paymentMethodId: "pm_mastercard",
        brand: "mastercard",
        last4: "4444",
        expMonth: 1,
        expYear: 2030,
      },
      stripeUpdatedAt: visa.stripeUpdatedAt + 120_000,
    };

    expect(await t.run((ctx) => savePaymentMethod(ctx, mastercard))).toBe("updated");
    expect((await customer())?.card?.paymentMethodId).toBe("pm_mastercard");
  });

  test("ignores a customer this deployment does not have", async () => {
    const t = convexTest(schema, modules);

    expect(
      await t.run((ctx) => refreshCard(ctx, { ...renewed, stripeCustomerId: "cus_elsewhere" })),
    ).toBe("unknown");
  });
});
