/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { updateCreatorNiches } from "../models/creatorNiches";
import { updateCreatorSkills } from "../models/creatorSkills";
import { createOpportunity } from "../models/opportunities";
import schema from "../schema";
import {
  opportunityArgs,
  seedCampaign,
  seedCreatorId,
  seedOpportunity,
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

  test("clears an opportunity's scores once creators can no longer see it", async () => {
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
      await ctx.db.patch("opportunities", opportunityId, { status: "paused" });
    });
    await scoreOpportunity(t, opportunityId);

    expect(await scoreCount(t)).toBe(0);
  });
});

describe("opportunityScores.scoreCreator", () => {
  test("rescores a creator after their profile changes and drops hidden opportunities", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "scores_owner" }, { niches: ["ai-agents"] });
    // A second campaign at the same company, so pausing it hides only this opportunity.
    const other = await seedCampaign(t, { subject: "scores_other_owner" });
    const hiddenId = await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          other.membership,
          opportunityArgs(other.campaignId, { niches: ["databases"] }),
        ),
    );
    const creatorId = await seedCreatorWithNiches(t, "scores_creator", ["databases"]);
    await scoreCreator(t, creatorId);
    expect(await scoresFor(t, creatorId)).toEqual([{ opportunityId: hiddenId, score: 1 }]);

    await t.run(async (ctx) => {
      await updateCreatorNiches(ctx, creatorId, ["ai-agents", "databases"]);
      await ctx.db.patch("campaigns", other.campaignId, { status: "paused" });
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
