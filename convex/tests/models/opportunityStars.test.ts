/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  listStarredOpportunities,
  starOpportunity,
  unstarOpportunity,
  withStarredFlags,
} from "../../models/opportunityStars";
import { discoverOpportunities } from "../../models/opportunities";
import { getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedCreatorId, seedOpportunity, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const firstPage = { numItems: 10, cursor: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

/** Reads every star so tests can check what was written. */
async function storedStars(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("opportunityStars").take(20));
}

/** Stars as the creator seeded with `subject`, a second after the previous star. */
async function star(t: TestConvex, subject: string, opportunityId: Id<"opportunities">) {
  vi.setSystemTime(Date.now() + 1000);
  await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error(`expected seeded user ${subject}`);
    await starOpportunity(ctx, user, opportunityId);
  });
}

/**
 * Seeds three open opportunities, lets `beforeHiding` act on them (e.g. star
 * them, which only works while they're visible), then hides them by pausing
 * their campaigns. They stay "open", so feeds still read them and must filter
 * them out.
 */
async function seedHiddenOpportunities(
  t: TestConvex,
  beforeHiding: (opportunityId: Id<"opportunities">) => Promise<void> = async () => {},
) {
  const seeded = [];
  for (let i = 0; i < 3; i++) seeded.push(await seedOpportunity(t, { subject: "hidden_owner" }));
  for (const { opportunityId } of seeded) await beforeHiding(opportunityId);
  for (const { campaignId } of seeded) {
    await t.run(async (ctx) => await ctx.db.patch("campaigns", campaignId, { status: "paused" }));
  }
  return seeded.map(({ opportunityId }) => opportunityId);
}

describe("starOpportunity", () => {
  test("stars an open opportunity for the creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");

    await star(t, "creator", opportunityId);

    expect(await storedStars(t)).toMatchObject([{ creatorId, opportunityId }]);
  });

  test("starring twice keeps a single star", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    await seedCreatorId(t, "creator");

    await star(t, "creator", opportunityId);
    await star(t, "creator", opportunityId);

    expect(await storedStars(t)).toHaveLength(1);
  });

  test.each(["draft", "paused", "closed"] as const)(
    "conceals a %s opportunity, which creators can't see",
    async (status) => {
      const t = convexTest(schema, modules);
      const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
      await t.run(async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status }));
      await seedCreatorId(t, "creator");

      await expectApiError(() => star(t, "creator", opportunityId), "not_found");
      expect(await storedStars(t)).toEqual([]);
    },
  );

  test("conceals an opportunity whose campaign is paused", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "owner" });
    await t.run(async (ctx) => await ctx.db.patch("campaigns", campaignId, { status: "paused" }));
    await seedCreatorId(t, "creator");

    await expectApiError(() => star(t, "creator", opportunityId), "not_found");
  });

  test("reports a missing opportunity as not found", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", opportunityId));
    await seedCreatorId(t, "creator");

    await expectApiError(() => star(t, "creator", opportunityId), "not_found");
  });
});

describe("unstarOpportunity", () => {
  test("removes only the creator's own star", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await star(t, "creator", opportunityId);
    await star(t, "other_creator", opportunityId);

    await t.run(async (ctx) => await unstarOpportunity(ctx, creatorId, opportunityId));

    expect(await storedStars(t)).toMatchObject([{ creatorId: otherCreatorId, opportunityId }]);
  });

  test("does nothing when the opportunity isn't starred", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");

    await t.run(async (ctx) => await unstarOpportunity(ctx, creatorId, opportunityId));

    expect(await storedStars(t)).toEqual([]);
  });

  test("still unstars after the opportunity closes", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await star(t, "creator", opportunityId);
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status: "closed" }),
    );

    await t.run(async (ctx) => await unstarOpportunity(ctx, creatorId, opportunityId));

    expect(await storedStars(t)).toEqual([]);
  });
});

describe("listStarredOpportunities", () => {
  test("lists the creator's starred briefs, most recently starred first", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t, { subject: "owner" });
    const second = await seedOpportunity(t, { subject: "owner" });
    const unstarred = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await seedCreatorId(t, "other_creator");
    await star(t, "creator", first.opportunityId);
    await star(t, "creator", second.opportunityId);
    await star(t, "other_creator", unstarred.opportunityId);

    const result = await t.run(
      async (ctx) => await listStarredOpportunities(ctx, creatorId, { paginationOpts: firstPage }),
    );

    expect(result.page).toMatchObject([
      { _id: second.opportunityId, companyName: "Acme", isStarred: true },
      { _id: first.opportunityId, companyName: "Acme", isStarred: true },
    ]);
    expect(result.page[0]).not.toHaveProperty("productAccessLink");
    expect(result.isDone).toBe(true);
  });

  test("leaves out starred opportunities creators can no longer see", async () => {
    const t = convexTest(schema, modules);
    const visible = await seedOpportunity(t, { subject: "owner" });
    const paused = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await star(t, "creator", visible.opportunityId);
    await star(t, "creator", paused.opportunityId);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", paused.opportunityId, { status: "paused" }),
    );

    const result = await t.run(
      async (ctx) => await listStarredOpportunities(ctx, creatorId, { paginationOpts: firstPage }),
    );

    expect(result.page.map((opportunity) => opportunity._id)).toEqual([visible.opportunityId]);
  });

  test("pages through starred opportunities", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const starred: Id<"opportunities">[] = [];
    for (let i = 0; i < 3; i++) {
      const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
      await star(t, "creator", opportunityId);
      starred.push(opportunityId);
    }

    const first = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          paginationOpts: { numItems: 2, cursor: null },
        }),
    );
    const next = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          paginationOpts: { numItems: 2, cursor: first.continueCursor },
        }),
    );

    expect([...first.page, ...next.page].map((opportunity) => opportunity._id)).toEqual(
      starred.reverse(),
    );
  });
});

describe("withStarredFlags", () => {
  test("marks which feed items the creator has starred", async () => {
    const t = convexTest(schema, modules);
    const starredOne = await seedOpportunity(t, { subject: "owner" });
    const plain = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await seedCreatorId(t, "other_creator");
    await star(t, "creator", starredOne.opportunityId);
    await star(t, "other_creator", plain.opportunityId);

    const flags = await t.run(async (ctx) => {
      const feed = await discoverOpportunities(ctx, { paginationOpts: firstPage });
      const flagged = await withStarredFlags(ctx, creatorId, feed.page);
      return Object.fromEntries(flagged.map((item) => [item._id, item.isStarred]));
    });

    expect(flags).toEqual({
      [starredOne.opportunityId]: true,
      [plain.opportunityId]: false,
    });
  });
});

describe("listStarredOpportunities filters", () => {
  /** Stars every opportunity, oldest first, so the last seeded is listed first. */
  async function starAll(t: TestConvex, ids: Id<"opportunities">[]) {
    for (const id of ids) await star(t, "creator", id);
  }

  test("keeps only starred briefs in the niche, accepting its label", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const match = await seedOpportunity(t, { subject: "owner" }, { niches: ["ai-agents"] });
    const other = await seedOpportunity(t, { subject: "owner" }, { niches: ["game-dev"] });
    const untagged = await seedOpportunity(t, { subject: "owner" });
    await starAll(
      t,
      [match, other, untagged].map(({ opportunityId }) => opportunityId),
    );

    const result = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          niche: "AI Agents",
          paginationOpts: firstPage,
        }),
    );

    expect(result.page.map((brief) => brief._id)).toEqual([match.opportunityId]);
  });

  test("access gated keeps only gated starred briefs", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const gated = await seedOpportunity(t, { subject: "owner" }, { isGated: true });
    const open = await seedOpportunity(t, { subject: "owner" }, { isGated: false });
    await star(t, "creator", gated.opportunityId);
    await star(t, "creator", open.opportunityId);

    const result = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          access: "gated",
          paginationOpts: firstPage,
        }),
    );

    expect(result.page.map((brief) => brief._id)).toEqual([gated.opportunityId]);
  });

  test("access open leaves out gated and full starred briefs", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const open = await seedOpportunity(t, { subject: "owner" }, { isGated: false });
    const full = await seedOpportunity(t, { subject: "owner" }, { isGated: false });
    const gated = await seedOpportunity(t, { subject: "owner" }, { isGated: true });
    await star(t, "creator", open.opportunityId);
    await star(t, "creator", full.opportunityId);
    await star(t, "creator", gated.opportunityId);
    await t.run(async (ctx) => {
      const opportunity = await ctx.db.get("opportunities", full.opportunityId);
      if (opportunity === null) throw new Error("expected seeded opportunity");
      await ctx.db.patch("opportunities", full.opportunityId, {
        numFilledSlots: opportunity.maxSlots,
      });
    });

    const result = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          access: "open",
          paginationOpts: firstPage,
        }),
    );

    expect(result.page.map((brief) => brief._id)).toEqual([open.opportunityId]);
  });

  test("refuses an unknown niche even when the creator has no stars", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");

    await expect(
      t.run(
        async (ctx) =>
          await listStarredOpportunities(ctx, creatorId, {
            niche: "crypto",
            paginationOpts: firstPage,
          }),
      ),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "invalid_niche" },
    });
  });

  test("a read cap with a niche filter still reaches the match and finishes", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const match = await seedOpportunity(t, { subject: "owner" }, { niches: ["llms"] });
    await star(t, "creator", match.opportunityId);
    // The three newest stars are off-niche, so they are read before the match.
    for (let i = 0; i < 3; i++) {
      const { opportunityId } = await seedOpportunity(
        t,
        { subject: "owner" },
        { niches: ["game-dev"] },
      );
      await star(t, "creator", opportunityId);
    }

    const seen: Id<"opportunities">[] = [];
    let cursor: string | null = null;
    let isDone = false;
    for (let pages = 0; pages < 10 && !isDone; pages++) {
      const result = await t.run(
        async (ctx) =>
          await listStarredOpportunities(ctx, creatorId, {
            niche: "llms",
            paginationOpts: { numItems: 2, cursor, maximumRowsRead: 2 },
          }),
      );
      seen.push(...result.page.map((brief) => brief._id));
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    expect(seen).toEqual([match.opportunityId]);
    expect(isDone).toBe(true);
  });
});

describe("feeds fill pages past hidden opportunities", () => {
  test("the starred list skips hidden stars instead of returning a short page", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const visible = await seedOpportunity(t, { subject: "owner" });
    await star(t, "creator", visible.opportunityId);
    // The three newest stars are all hidden, so a filter-after-pagination page of 2 would be empty.
    await seedHiddenOpportunities(t, async (hiddenId) => await star(t, "creator", hiddenId));

    const result = await t.run(
      async (ctx) =>
        await listStarredOpportunities(ctx, creatorId, {
          paginationOpts: { numItems: 2, cursor: null },
        }),
    );

    expect(result.page.map((brief) => brief._id)).toEqual([visible.opportunityId]);
    expect(result.isDone).toBe(true);
  });

  test("discover skips hidden opportunities instead of returning a short page", async () => {
    const t = convexTest(schema, modules);
    // Read first: same deadline, created earlier.
    await seedHiddenOpportunities(t);
    const visible = await seedOpportunity(t, { subject: "owner" });

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, { paginationOpts: { numItems: 2, cursor: null } }),
    );

    expect(result.page.map((brief) => brief._id)).toEqual([visible.opportunityId]);
  });

  test("a read cap returns early with a cursor that picks up where it stopped", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const visible = await seedOpportunity(t, { subject: "owner" });
    await star(t, "creator", visible.opportunityId);
    await seedHiddenOpportunities(t, async (hiddenId) => await star(t, "creator", hiddenId));

    const seen: Id<"opportunities">[] = [];
    let cursor: string | null = null;
    let isDone = false;
    for (let pages = 0; pages < 10 && !isDone; pages++) {
      const result = await t.run(
        async (ctx) =>
          await listStarredOpportunities(ctx, creatorId, {
            paginationOpts: { numItems: 2, cursor, maximumRowsRead: 2 },
          }),
      );
      seen.push(...result.page.map((brief) => brief._id));
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    expect(seen).toEqual([visible.opportunityId]);
    expect(isDone).toBe(true);
  });
});

describe("withStarredFlags with many stars", () => {
  test("still flags correctly when the creator has more stars than one read loads", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator");
    const filler = await seedOpportunity(t, { subject: "owner" });
    const target = await seedOpportunity(t, { subject: "owner" });
    // 1,000 older stars fill the bulk read, so the newest star isn't in it.
    await t.run(async (ctx) => {
      for (let i = 0; i < 1000; i++) {
        await ctx.db.insert("opportunityStars", { creatorId, opportunityId: filler.opportunityId });
      }
    });
    await star(t, "creator", target.opportunityId);

    const flags = await t.run(async (ctx) => {
      const feed = await discoverOpportunities(ctx, { paginationOpts: firstPage });
      const flagged = await withStarredFlags(ctx, creatorId, feed.page);
      return Object.fromEntries(flagged.map((item) => [item._id, item.isStarred]));
    });

    expect(flags[target.opportunityId]).toBe(true);
  });
});
