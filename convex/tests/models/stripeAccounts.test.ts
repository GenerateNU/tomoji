/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  abandonAccountCreation,
  beginAccountCreation,
  createStripeAccount,
  disconnectStripeAccount,
  getStripeAccountByCreatorId,
  getStripeAccountByStripeId,
  toStripeAccountStatus,
  updateStripeAccount,
  type StripeAccountState,
} from "../../models/stripeAccounts";
import schema from "../../schema";
import type { Doc, Id } from "../../_generated/dataModel";
import { expectApiError, seedCreatorId, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

// A freshly created account owes Stripe its whole onboarding form.
const created: StripeAccountState = {
  stripeAccountId: "acct_creator",
  detailsSubmitted: false,
  payoutsEnabled: false,
  requirementsDue: true,
  stripeUpdatedAt: 1_700_000_000_000,
};

/**
 * Sets the creator's profile country (none if undefined) and begins an attempt,
 * as `onboardingLink` does when the creator clicks.
 */
function beginWithCountry(t: TestConvex, creatorId: Id<"creators">, country: string | undefined) {
  return t.run(async (ctx) => {
    await ctx.db.patch("creators", creatorId, { countryOfResidence: country });
    return await beginAccountCreation(ctx, creatorId);
  });
}

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
        row({
          detailsSubmitted: false,
          payoutsEnabled: false,
          requirementsDue: true,
        }),
      ),
    ).toBe("actionRequired");
    // Not submitted is unfinished even when Stripe lists nothing as due yet.
    expect(
      toStripeAccountStatus(
        row({
          detailsSubmitted: false,
          payoutsEnabled: false,
          requirementsDue: false,
        }),
      ),
    ).toBe("actionRequired");
  });

  // Failed verification puts requirements back in currently_due.
  test("asks the creator to act when Stripe needs more information after submission", () => {
    expect(
      toStripeAccountStatus(
        row({
          detailsSubmitted: true,
          payoutsEnabled: false,
          requirementsDue: true,
        }),
      ),
    ).toBe("actionRequired");
  });

  test("is inReview while Stripe verifies a submitted form with nothing due", () => {
    expect(
      toStripeAccountStatus(
        row({
          detailsSubmitted: true,
          payoutsEnabled: false,
          requirementsDue: false,
        }),
      ),
    ).toBe("inReview");
  });

  // Requirements due by a future deadline do not stop payouts until then.
  test("is ready whenever Stripe allows payouts", () => {
    expect(
      toStripeAccountStatus(
        row({
          detailsSubmitted: true,
          payoutsEnabled: true,
          requirementsDue: false,
        }),
      ),
    ).toBe("ready");
    expect(
      toStripeAccountStatus(
        row({
          detailsSubmitted: true,
          payoutsEnabled: true,
          requirementsDue: true,
        }),
      ),
    ).toBe("ready");
  });

  // Stripe declined the account for good (for example `rejected.fraud`); its flags
  // then look like a submitted form awaiting review, which would never change.
  test("is rejected once Stripe declines the account, whatever the flags say", () => {
    const declined = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: false,
      requirementsDue: false,
      rejected: true,
    } as Doc<"stripeAccounts">;

    expect(toStripeAccountStatus(declined)).toBe("rejected");
  });

  // Stripe's last flags still say payouts are on, but Tomoji can no longer use the account.
  test("is disconnected once the creator removes Tomoji from their Stripe account", () => {
    const disconnected = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: true,
      requirementsDue: false,
      disconnectedAt: 1_700_000_100_000,
    } as Doc<"stripeAccounts">;

    expect(toStripeAccountStatus(disconnected)).toBe("disconnected");
  });
});

describe("beginAccountCreation", () => {
  /** Starts or resumes an attempt, failing the test if an account came back instead. */
  async function begin(t: TestConvex, creatorId: Id<"creators">, country: string | undefined) {
    const result = await beginWithCountry(t, creatorId, country);
    if (!("attempt" in result)) throw new Error("expected an attempt, got an account");
    return result;
  }

  test("records the attempt with the creator's country before Stripe is called", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_new");

    const { attempt, retry } = await begin(t, creatorId, "CA");

    expect(retry).toBe(false);
    expect(attempt).toMatchObject({ creatorId, country: "CA" });
  });

  // The retry must repeat the first request exactly, so Stripe returns the same
  // account instead of creating a second one in the new country.
  test("returns the pending attempt unchanged on a retry, even if the country changed", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_retry");
    const first = await begin(t, creatorId, "CA");

    const again = await begin(t, creatorId, "GB");

    expect(again.retry).toBe(true);
    expect(again.attempt._id).toBe(first.attempt._id);
    expect(again.attempt.country).toBe("CA");
  });

  // A second click that read "no account" before the first click saved one must
  // not start another attempt, whose new key would make a second Stripe account.
  test("returns the account another request already saved instead of starting an attempt", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_already_saved");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    const result = await beginWithCountry(t, creatorId, "US");

    expect(result).toMatchObject({
      account: { stripeAccountId: "acct_creator" },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccountCreations").first()).toBeNull();
    });
  });

  // Reconnecting needs a new account, so a disconnected one does not count.
  test("starts an attempt for a creator whose account is disconnected", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_reconnect");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000));

    const { retry } = await begin(t, creatorId, "US");

    expect(retry).toBe(false);
  });

  // Stripe fixes an account's country forever, so it must never be guessed.
  test("refuses a creator with no country before anything is recorded", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_no_country");

    await expectApiError(
      () => beginWithCountry(t, creatorId, undefined),
      "invalid_state",
      "country_required",
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccountCreations").first()).toBeNull();
    });
  });

  test("lets the creator start over once an attempt is abandoned", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_abandon");
    const refused = await begin(t, creatorId, "NG");

    await t.run((ctx) => abandonAccountCreation(ctx, refused.attempt._id));
    const { attempt, retry } = await begin(t, creatorId, "CA");

    expect(retry).toBe(false);
    expect(attempt.country).toBe("CA");
  });

  // A slow refusal of the old attempt must not delete the creator's new one,
  // or the next click would start a third attempt with yet another key.
  test("abandoning an old attempt leaves the creator's newer attempt alone", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "attempt_abandon_late");
    const old = await begin(t, creatorId, "NG");
    await t.run((ctx) => abandonAccountCreation(ctx, old.attempt._id));
    const current = await begin(t, creatorId, "CA");

    await t.run((ctx) => abandonAccountCreation(ctx, old.attempt._id));

    const again = await begin(t, creatorId, "CA");
    expect(again.retry).toBe(true);
    expect(again.attempt._id).toBe(current.attempt._id);
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
          createStripeAccount(ctx, creatorId, {
            ...created,
            stripeAccountId: "acct_other",
          }),
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

  test("closes the attempt the account came from once it is saved", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_attempt_done");
    const begun = await beginWithCountry(t, creatorId, "US");
    if (!("attempt" in begun)) throw new Error("expected an attempt");

    await t.run((ctx) => createStripeAccount(ctx, creatorId, created, begun.attempt._id));

    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeAccountCreations").first()).toBeNull();
    });
  });

  // Two clicks can share an attempt; the slower one may save after the creator
  // has disconnected and started reconnecting. It must not close that newer
  // attempt, or another click would start a third with yet another key.
  test("a delayed save of an old account leaves the creator's newer attempt alone", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_attempt_delayed");
    const first = await beginWithCountry(t, creatorId, "US");
    if (!("attempt" in first)) throw new Error("expected an attempt");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created, first.attempt._id));
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000));
    const reconnect = await beginWithCountry(t, creatorId, "US");
    if (!("attempt" in reconnect)) throw new Error("expected an attempt");

    await t.run((ctx) => createStripeAccount(ctx, creatorId, created, first.attempt._id));

    const again = await beginWithCountry(t, creatorId, "US");
    expect(again).toMatchObject({
      retry: true,
      attempt: { _id: reconnect.attempt._id },
    });
  });

  // Reconnecting after a disconnect needs a new account; the old one is gone for good.
  test("replaces a disconnected account with the new one", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_reconnect");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, { ...created, payoutsEnabled: true }));
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000));

    const replacement = { ...created, stripeAccountId: "acct_replacement" };
    await t.run((ctx) => createStripeAccount(ctx, creatorId, replacement));

    await t.run(async (ctx) => {
      const account = await getStripeAccountByCreatorId(ctx, creatorId);
      expect(account).toMatchObject(replacement);
      expect(account?.disconnectedAt).toBeUndefined();
      expect(await getStripeAccountByStripeId(ctx, "acct_creator")).toBeNull();
    });
  });
});

describe("disconnectStripeAccount", () => {
  test("marks the account disconnected", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_disconnect");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    expect(
      await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000)),
    ).toBe("disconnected");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject({
        disconnectedAt: 1_700_000_100_000,
      });
    });
  });

  // Stripe redelivers events; the first disconnect time is the one that happened.
  test("keeps the first disconnect time when the event repeats", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_disconnect_again");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000));

    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_200_000));

    await t.run(async (ctx) => {
      expect((await getStripeAccountByCreatorId(ctx, creatorId))?.disconnectedAt).toBe(
        1_700_000_100_000,
      );
    });
  });

  // After reconnecting, a late disconnect for the old account must not touch the new one.
  test("ignores an account this deployment does not have", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_disconnect_unknown");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));

    expect(await t.run((ctx) => disconnectStripeAccount(ctx, "acct_old", 1_700_000_100_000))).toBe(
      "unknown",
    );

    await t.run(async (ctx) => {
      expect((await getStripeAccountByCreatorId(ctx, creatorId))?.disconnectedAt).toBeUndefined();
    });
  });

  // An update can arrive after the disconnect; Stripe's flags must not reconnect it.
  test("stays disconnected when a later update arrives", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "stripe_disconnect_late");
    await t.run((ctx) => createStripeAccount(ctx, creatorId, created));
    await t.run((ctx) => disconnectStripeAccount(ctx, "acct_creator", 1_700_000_100_000));

    await t.run((ctx) =>
      updateStripeAccount(ctx, {
        ...created,
        payoutsEnabled: true,
        stripeUpdatedAt: 1_700_000_200_000,
      }),
    );

    await t.run(async (ctx) => {
      expect(toStripeAccountStatus(await getStripeAccountByCreatorId(ctx, creatorId))).toBe(
        "disconnected",
      );
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

  test("applies a state read at the same moment as the stored one", async () => {
    const { t, creatorId } = await seedAccount("stripe_same_moment");
    const submitted = { ...created, detailsSubmitted: true };

    expect(await t.run((ctx) => updateStripeAccount(ctx, submitted))).toBe("updated");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(submitted);
    });
  });

  // Two webhook deliveries can read the account and then save in reverse order.
  // The read that finished later reflects Stripe's newer state and must win.
  test("keeps a later read when an earlier read is saved after it", async () => {
    const { t, creatorId } = await seedAccount("stripe_reads_reordered");
    const laterRead = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: false,
      stripeUpdatedAt: created.stripeUpdatedAt + 2_000,
    };
    const earlierRead = {
      ...created,
      detailsSubmitted: true,
      payoutsEnabled: true,
      stripeUpdatedAt: created.stripeUpdatedAt + 1_000,
    };

    await t.run((ctx) => updateStripeAccount(ctx, laterRead));
    expect(await t.run((ctx) => updateStripeAccount(ctx, earlierRead))).toBe("stale");

    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject(laterRead);
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
    await beginWithCountry(t, creatorId, "US");

    const result = await t.run((ctx) => updateStripeAccount(ctx, created, creatorId));

    expect(result).toBe("adopted");
    await t.run(async (ctx) => {
      expect(await getStripeAccountByCreatorId(ctx, creatorId)).toMatchObject({
        creatorId,
        ...created,
      });
      // The attempt is finished; a later reconnect must not reuse its country.
      expect(await ctx.db.query("stripeAccountCreations").first()).toBeNull();
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
