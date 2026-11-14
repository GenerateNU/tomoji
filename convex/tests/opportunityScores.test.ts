/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { updateCreatorNiches } from "../models/creatorNiches";
import { updateCreatorSkills } from "../models/creatorSkills";
import { createOpportunity } from "../models/opportunities";
import schema from "../schema";
import {
  opportunityArgs,
  seedCampaign,
  seedCreatorId,
  seedOpportunity,
  seedUser,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

async function scoresFor(t: TestConvex, creatorId: Id<"creators">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("opportunityScores")
        .withIndex("by_creatorId_and_score", (q) => q.eq("creatorId", creatorId))
        .order("desc")
        .take(100)
    ).map(({ opportunityId, score }) => ({ opportunityId, score })),
  );
}

async function scoreCount(t: TestConvex) {
  return await t.run(async (ctx) => (await ctx.db.query("opportunityScores").take(10)).length);
}

async function seedCreatorWithNiches(t: TestConvex, subject: string, niches: string[]) {
  const creatorId = await seedCreatorId(t, subject);
  await t.run(async (ctx) => await updateCreatorNiches(ctx, creatorId, niches));
  return creatorId;
}

async function scoreOpportunity(t: TestConvex, opportunityId: Id<"opportunities">) {
  await t.mutation(internal.opportunityScores.scoreOpportunity, { opportunityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function scoreCreator(t: TestConvex, creatorId: Id<"creators">) {
  await t.mutation(internal.opportunityScores.scoreCreator, { creatorId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("opportunityScores.scoreOpportunity", () => {
  test("scores creators who share a niche and stores nothing for the rest", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "scores_owner" },
      { niches: ["ai-agents", "llms"] },
    );
    const match = await seedCreatorWithNiches(t, "scores_match", ["ai-agents", "llms"]);
    const partial = await seedCreatorWithNiches(t, "scores_partial", ["ai-agents"]);
    const none = await seedCreatorWithNiches(t, "scores_none", ["databases"]);

    await scoreOpportunity(t, opportunityId);

    expect(await scoresFor(t, match)).toEqual([{ opportunityId, score: 1 }]);
    expect(await scoresFor(t, partial)).toEqual([{ opportunityId, score: 0.5 }]);
    expect(await scoresFor(t, none)).toEqual([]);
  });

  test("clears an opportunity's scores once it closes", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "scores_owner" },
      { niches: ["ai-agents"] },
    );
    await seedCreatorWithNiches(t, "scores_creator", ["ai-agents"]);
    await scoreOpportunity(t, opportunityId);
    expect(await scoreCount(t)).toBe(1);

    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", opportunityId, { status: "closed" });
    });
    await scoreOpportunity(t, opportunityId);

    expect(await scoreCount(t)).toBe(0);
  });
});

describe("opportunityScores.scoreCreator", () => {
  test("rescores a creator after their profile changes and drops closed opportunities", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "scores_owner" }, { niches: ["ai-agents"] });
    const other = await seedCampaign(t, { subject: "scores_other_owner" });
    const closedId = await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          other.membership,
          opportunityArgs(other.campaignId, { niches: ["databases"] }),
        ),
    );
    const creatorId = await seedCreatorWithNiches(t, "scores_creator", ["databases"]);
    await scoreCreator(t, creatorId);
    expect(await scoresFor(t, creatorId)).toEqual([{ opportunityId: closedId, score: 1 }]);

    await t.run(async (ctx) => {
      await updateCreatorNiches(ctx, creatorId, ["ai-agents", "databases"]);
      await ctx.db.patch("opportunities", closedId, { status: "closed" });
    });
    await scoreCreator(t, creatorId);

    expect(await scoresFor(t, creatorId)).toEqual([
      { opportunityId: owner.opportunityId, score: 1 },
    ]);
  });

  test("only scores opportunities that share one of the creator's selections", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "scores_owner" }, { skills: ["python"] });
    const other = await seedCampaign(t, { subject: "scores_other_owner" });
    await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          other.membership,
          opportunityArgs(other.campaignId, { skills: ["react"] }),
        ),
    );
    const creatorId = await seedCreatorId(t, "scores_creator");
    await t.run(async (ctx) => await updateCreatorSkills(ctx, creatorId, ["python"]));

    await scoreCreator(t, creatorId);

    expect(await scoresFor(t, creatorId)).toEqual([
      { opportunityId: owner.opportunityId, score: 1 },
    ]);
  });
});

describe("opportunities.discover", () => {
  test("lists a creator's matches first once they pick niches, then the rest by deadline", async () => {
    const t = convexTest(schema, modules);
    const sooner = await seedOpportunity(
      t,
      { subject: "scores_sooner" },
      { niches: ["databases"] },
    );
    const later = await seedOpportunity(
      t,
      { subject: "scores_later" },
      { niches: ["ai-agents"], deadline: Date.now() + 172_800_000 },
    );
    const asCreator = await seedUser(t, { subject: "scores_creator" });

    await asCreator.mutation(api.creators.update, { niches: ["ai-agents"] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    const second = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });

    expect(first.page.map(({ _id }) => _id)).toEqual([later.opportunityId]);
    expect(second.page.map(({ _id }) => _id)).toEqual([sooner.opportunityId]);
  });

  test("pinned pages keep every brief exactly once when scores change between loads", async () => {
    const t = convexTest(schema, modules);
    const ids: Id<"opportunities">[] = [];
    for (const subject of ["pinned_a", "pinned_b", "pinned_c"]) {
      ids.push((await seedOpportunity(t, { subject })).opportunityId);
    }
    const unscored = (await seedOpportunity(t, { subject: "pinned_rest" })).opportunityId;
    const asCreator = await seedUser(t, { subject: "pinned_creator" });
    const creatorId = await seedCreatorId(t, "pinned_creator");
    const scoreIds = await t.run(async (ctx) =>
      Promise.all(
        ids.map((opportunityId, index) =>
          ctx.db.insert("opportunityScores", {
            creatorId,
            opportunityId,
            score: 0.9 - index * 0.1,
          }),
        ),
      ),
    );
    const load = (cursor: string | null, endCursor?: string) =>
      asCreator.query(api.opportunities.discover, {
        paginationOpts: { numItems: 2, cursor, endCursor },
      });
    const first = await load(null);
    const second = await load(first.continueCursor);
    const third = await load(second.continueCursor);

    // The last match jumps to the top, as a rescore after a profile edit would.
    await t.run((ctx) => ctx.db.patch("opportunityScores", scoreIds[2], { score: 1 }));
    // usePaginatedQuery reruns each loaded page pinned to the cursor it ended at.
    const pages = [
      await load(null, first.continueCursor),
      await load(first.continueCursor, second.continueCursor),
      await load(second.continueCursor, third.continueCursor),
    ];

    const shown = pages.flatMap((page) => page.page.map((brief) => brief._id));
    expect(shown).toHaveLength(4);
    expect(new Set(shown)).toEqual(new Set([...ids, unscored]));
    expect(shown[0]).toBe(ids[2]);
  });
});
