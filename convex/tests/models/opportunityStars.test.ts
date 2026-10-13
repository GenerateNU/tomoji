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

async function star(t: TestConvex, creatorId: Id<"creators">, opportunityId: Id<"opportunities">) {
  vi.setSystemTime(Date.now() + 1000);
  await t.run(async (ctx) => await starOpportunity(ctx, creatorId, opportunityId));
}

describe("starOpportunity", () => {
  test("stars an open opportunity for the creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");

    await star(t, creatorId, opportunityId);

    expect(await storedStars(t)).toMatchObject([{ creatorId, opportunityId }]);
  });

  test("starring twice keeps a single star", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");

    await star(t, creatorId, opportunityId);
    await star(t, creatorId, opportunityId);

    expect(await storedStars(t)).toHaveLength(1);
  });

  test.each(["draft", "paused", "closed"] as const)(
    "conceals a %s opportunity, which creators can't see",
    async (status) => {
      const t = convexTest(schema, modules);
      const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
      await t.run(async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status }));
      const creatorId = await seedCreatorId(t, "creator");

      await expectApiError(
        () => t.run(async (ctx) => await starOpportunity(ctx, creatorId, opportunityId)),
        "not_found",
      );
      expect(await storedStars(t)).toEqual([]);
    },
  );

  test("conceals an opportunity whose campaign is paused", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "owner" });
    await t.run(async (ctx) => await ctx.db.patch("campaigns", campaignId, { status: "paused" }));
    const creatorId = await seedCreatorId(t, "creator");

    await expectApiError(
      () => t.run(async (ctx) => await starOpportunity(ctx, creatorId, opportunityId)),
      "not_found",
    );
  });

  test("reports a missing opportunity as not found", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", opportunityId));
    const creatorId = await seedCreatorId(t, "creator");

    await expectApiError(
      () => t.run(async (ctx) => await starOpportunity(ctx, creatorId, opportunityId)),
      "not_found",
    );
  });
});

describe("unstarOpportunity", () => {
  test("removes only the creator's own star", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await star(t, creatorId, opportunityId);
    await star(t, otherCreatorId, opportunityId);

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
    await star(t, creatorId, opportunityId);
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
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await star(t, creatorId, first.opportunityId);
    await star(t, creatorId, second.opportunityId);
    await star(t, otherCreatorId, unstarred.opportunityId);

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
    await star(t, creatorId, visible.opportunityId);
    await star(t, creatorId, paused.opportunityId);
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
      await star(t, creatorId, opportunityId);
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
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await star(t, creatorId, starredOne.opportunityId);
    await star(t, otherCreatorId, plain.opportunityId);

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
