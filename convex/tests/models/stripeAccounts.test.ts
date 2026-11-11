/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  createStripeAccount,
  getStripeAccountByCreatorId,
  getStripeAccountByStripeId,
  toStripeAccountStatus,
  updateStripeAccount,
  type StripeAccountState,
} from "../../models/stripeAccounts";
import schema from "../../schema";
import type { Doc } from "../../_generated/dataModel";
import { expectApiError, seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

// A freshly created account owes Stripe its whole onboarding form.
const created: StripeAccountState = {
  stripeAccountId: "acct_creator",
  detailsSubmitted: false,
  payoutsEnabled: false,
  requirementsDue: true,
  stripeUpdatedAt: 1_700_000_000_000,
};

describe("toStripeAccountStatus", () => {
  const row = (
    flags: Pick<StripeAccountState, "detailsSubmitted" | "payoutsEnabled" | "requirementsDue">,
  ) => ({ ...created, ...flags }) as Doc<"stripeAccounts">;

  test("is notStarted before the creator has a Stripe account", () => {
    expect(toStripeAccountStatus(null)).toBe("notStarted");
  });

  test("asks the creator to act while the onboarding form is unfinished", () => {
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: false, payoutsEnabled: false, requirementsDue: true }),
      ),
    ).toBe("actionRequired");
    // Not submitted is unfinished even when Stripe lists nothing as due yet.
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: false, payoutsEnabled: false, requirementsDue: false }),
      ),
    ).toBe("actionRequired");
  });

  // Failed verification puts requirements back in currently_due.
  test("asks the creator to act when Stripe needs more information after submission", () => {
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: true, payoutsEnabled: false, requirementsDue: true }),
      ),
    ).toBe("actionRequired");
  });

  test("is inReview while Stripe verifies a submitted form with nothing due", () => {
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: true, payoutsEnabled: false, requirementsDue: false }),
      ),
    ).toBe("inReview");
  });

  // Requirements due by a future deadline do not stop payouts until then.
  test("is ready whenever Stripe allows payouts", () => {
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: true, payoutsEnabled: true, requirementsDue: false }),
      ),
    ).toBe("ready");
    expect(
      toStripeAccountStatus(
        row({ detailsSubmitted: true, payoutsEnabled: true, requirementsDue: true }),
      ),
    ).toBe("ready");
  });
});

describe("createStripeAccount", () => {
  test("records a new account that cannot receive money yet", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_new");

    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    await t.run(async (ctx) => {
      const account = await getStripeAccountByCreatorId(ctx, creatorId);
      expect(account).toMatchObject({ creatorId, ...created });
      expect(await getStripeAccountByStripeId(ctx, "acct_creator")).toEqual(account);
    });
  });

  // Concurrent onboarding clicks share an idempotency key, so Stripe hands
  // both the same account and both try to save it.
  test("returns the existing row when the same account is saved again", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_retry");

    const first = await t.run((ctx) => createStripeAccount(ctx, creatorId, created));
    const second = await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    expect(second._id).toBe(first._id);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccounts").take(2)).toHaveLength(1);
    });
  });

  test("refuses a second Stripe account for the same creator", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_second");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    await expectApiError(
      () =>
        t.run((ctx) =>
          createStripeAccount(ctx, creatorId, { ...created, stripeAccountId: "acct_other" }),
        ),
      "conflict",
      "stripe_account_exists",
    );
    await t.run(async (ctx) => {
      expect(await getStripeAccountByStripeId(ctx, "acct_other")).toBeNull();
    });
  });

  test("refuses an account for a creator who no longer exists", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_deleted");
    await t.run(async (ctx) => await ctx.db.delete("creators", creatorId));

    await expectApiError(
      () => t.run((ctx) => createStripeAccount(ctx, creatorId, created)),
      "not_found",
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccounts").first()).toBeNull();
    });
  });
});

describe("updateStripeAccount", () => {
  async function seedAccount(subject: string) {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, subject);
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));
    return { t, creatorId };
  }

  test("applies a newer state from Stripe", async () => {
    const { t, creatorId } = await seedAccount("stripe_update");
    const ready = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      stripeUpdatedAt: created.stripeUpdatedAt + 60_000,
    };

    expect(await t.run((ctx) => updateStripeAccount(ctx, ready))).toBe("updated");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(ready);
    });
  });

  // Stripe does not deliver webhooks in order; an older event must not undo
  // a newer one.
  test("skips a state older than the one stored", async () => {
    const { t, creatorId } = await seedAccount("stripe_stale");
    const ready = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      stripeUpdatedAt: created.stripeUpdatedAt + 60_000,
    };
    await t.run((ctx) => updateStripeAccount(ctx, ready));

    const older = {
      ...created,
      detailsSubmitted: true,
      stripeUpdatedAt: ready.stripeUpdatedAt - 1,
    };
    expect(await t.run((ctx) => updateStripeAccount(ctx, older))).toBe("stale");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(ready);
    });
  });

  // Stripe timestamps are whole seconds, so two real changes can share one.
  test("applies a state with the same timestamp as the stored one", async () => {
    const { t, creatorId } = await seedAccount("stripe_same_second");
    const submitted = { ...created, detailsSubmitted: true };

    expect(await t.run((ctx) => updateStripeAccount(ctx, submitted))).toBe("updated");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(submitted);
    });
  });

  // Developers share one Stripe sandbox, so a deployment receives events for
  // accounts other deployments created.
  test("ignores an account this deployment never created", async () => {
    const { t, creatorId } = await seedAccount("stripe_unknown");

    const result = await t.run((ctx) =>
      updateStripeAccount(ctx, {
        ...created,
        stripeAccountId: "acct_elsewhere",
        payoutsEnabled: true,
      }),
    );

    expect(result).toBe("unknown");
    await t.run(async (ctx) => {
      expect(await getStripeAccountByStripeId(ctx, "acct_elsewhere")).toBeNull();
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(created);
    });
  });

  // Another deployment's creator ids do not exist here.
  test("ignores an account tagged with a creator this deployment does not have", async () => {
    const { t } = await seedAccount("stripe_foreign_tag");

    const result = await t.run((ctx) =>
      updateStripeAccount(ctx, { ...created, stripeAccountId: "acct_elsewhere" }, "k57notours"),
    );

    expect(result).toBe("unknown");
    await t.run(async (ctx) => {
      expect(await getStripeAccountByStripeId(ctx, "acct_elsewhere")).toBeNull();
    });
  });
});

// If the server stops between Stripe creating an account and our save, Stripe's
// next event for that account still carries the creator we tagged it with.
describe("updateStripeAccount adopting an unsaved account", () => {
  test("records the account for our creator who has none", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_adopt");

    const result = await t.run((ctx) => updateStripeAccount(ctx, created, creatorId));

    expect(result).toBe("adopted");
    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject({
        creatorId,
        ...created,
      });
    });
  });

  // The creator's recorded account is the one money goes to; a second is
  // left unused rather than replacing it.
  test("leaves a creator's recorded account in place", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_adopt_taken");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    const result = await t.run((ctx) =>
      updateStripeAccount(ctx, { ...created, stripeAccountId: "acct_duplicate" }, creatorId),
    );

    expect(result).toBe("unknown");
    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(created);
      expect(await getStripeAccountByStripeId(ctx, "acct_duplicate")).toBeNull();
    });
  });

  test("ignores an account tagged with a deleted creator", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_adopt_deleted");
    await t.run(async (ctx) => await ctx.db.delete("creators", creatorId));

    const result = await t.run((ctx) => updateStripeAccount(ctx, created, creatorId));

    expect(result).toBe("unknown");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccounts").first()).toBeNull();
    });
  });
});
