/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
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

type DiscoverPage = FunctionReturnType<typeof api.opportunities.discover>;
type LoadDiscoverPage = (cursor: string | null, endCursor?: string) => Promise<DiscoverPage>;

/** Loads every feed page the way the client does: each starts where the last ended. */
async function loadPageBounds(load: LoadDiscoverPage) {
  const bounds: [string | null, string][] = [];
  for (let cursor: string | null = null; ;) {
    const page = await load(cursor);
    bounds.push([cursor, page.continueCursor]);
    if (page.isDone) return bounds;
    cursor = page.continueCursor;
  }
}

/**
 * Reruns each loaded page pinned to its end, splitting where the server asks,
 * as convex-helpers' usePaginatedQuery does after the data changes.
 */
async function rerunPinned(load: LoadDiscoverPage, bounds: [string | null, string][]) {
  const rerun = async (cursor: string | null, endCursor: string, depth = 0) => {
    const page = await load(cursor, endCursor);
    if (page.pageStatus !== "SplitRequired" || !page.splitCursor) return [page];
    if (depth > 5) throw new Error(`split did not converge at ${cursor} → ${endCursor}`);
    const pages: DiscoverPage[] = [
      ...(await rerun(cursor, page.splitCursor, depth + 1)),
      ...(await rerun(page.splitCursor, endCursor, depth + 1)),
    ];
    return pages;
  };
  return (await Promise.all(bounds.map(([cursor, end]) => rerun(cursor, end)))).flat();
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

  // A read cap below the number of matches makes the first rerun stop partway
  // through them and ask for a split.
  test.each([
    { label: "in one read", maximumRowsRead: undefined },
    { label: "across a split", maximumRowsRead: 4 },
  ])(
    "pinned pages that run past the matches keep matches added after they loaded ($label)",
    async ({ maximumRowsRead }) => {
      const t = convexTest(schema, modules);
      const matched = (await seedOpportunity(t, { subject: "grow_match" })).opportunityId;
      const rest: Id<"opportunities">[] = [];
      for (let index = 0; index < 5; index++) {
        const deadline = Date.now() + (index + 2) * 86_400_000;
        rest.push(
          (await seedOpportunity(t, { subject: `grow_r${index}` }, { deadline })).opportunityId,
        );
      }
      const asCreator = await seedUser(t, { subject: "grow_creator" });
      const creatorId = await seedCreatorId(t, "grow_creator");
      await t.run((ctx) =>
        ctx.db.insert("opportunityScores", {
          creatorId,
          opportunityId: matched,
          score: 0.9,
        }),
      );
      // The cap applies to reruns only, so the first load lays out the same pages.
      const load: LoadDiscoverPage = (cursor, endCursor) =>
        asCreator.query(api.opportunities.discover, {
          paginationOpts: {
            numItems: 2,
            cursor,
            endCursor,
            maximumRowsRead: endCursor ? maximumRowsRead : undefined,
          },
        });
      const bounds = await loadPageBounds(load);

      // A profile edit makes four briefs further down the rest list match too.
      const added = rest.slice(1);
      await t.run(async (ctx) => {
        for (const [index, opportunityId] of added.entries()) {
          await ctx.db.insert("opportunityScores", {
            creatorId,
            opportunityId,
            score: 0.5 - index * 0.1,
          });
        }
      });
      const pages = await rerunPinned(load, bounds);

      const shown = pages.flatMap((page) => page.page.map((brief) => brief._id));
      expect(shown).toEqual([matched, ...added, rest[0]]);
      if (maximumRowsRead !== undefined) expect(pages.length).toBeGreaterThan(bounds.length);
    },
  );

  test("pinned pages keep a brief exactly once after a profile edit drops its match", async () => {
    const t = convexTest(schema, modules);
    const seedDue = async (subject: string, days: number) =>
      (await seedOpportunity(t, { subject }, { deadline: Date.now() + days * 86_400_000 }))
        .opportunityId;
    const matches = [
      await seedDue("drop_a", 5),
      await seedDue("drop_b", 6),
      await seedDue("drop_c", 7),
    ];
    const rest = [await seedDue("drop_r0", 2), await seedDue("drop_r1", 3)];
    const asCreator = await seedUser(t, { subject: "drop_creator" });
    const creatorId = await seedCreatorId(t, "drop_creator");
    const scoreIds = await t.run(async (ctx) => {
      const ids: Id<"opportunityScores">[] = [];
      for (const [index, opportunityId] of matches.entries()) {
        ids.push(
          await ctx.db.insert("opportunityScores", {
            creatorId,
            opportunityId,
            score: 0.9 - index * 0.1,
          }),
        );
      }
      return ids;
    });
    const load: LoadDiscoverPage = (cursor, endCursor) =>
      asCreator.query(api.opportunities.discover, {
        paginationOpts: { numItems: 2, cursor, endCursor },
      });
    // Pages: two matches, the last match and the first brief after them, then the rest.
    const bounds = await loadPageBounds(load);

    // Removing a skill drops the second match, sending its brief back to the
    // rest list, where it comes last by deadline.
    await t.run((ctx) => ctx.db.delete("opportunityScores", scoreIds[1]));
    const pages = await rerunPinned(load, bounds);

    const shown = pages.flatMap((page) => page.page.map((brief) => brief._id));
    expect(shown).toEqual([matches[0], matches[2], ...rest, matches[1]]);
  });
});
