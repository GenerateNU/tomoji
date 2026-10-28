/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { listCreatorNiches, updateCreatorNiches } from "../../models/creatorNiches";
import schema from "../../schema";
import { expectApiError, seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("updateCreatorNiches", () => {
  test("replaces selections in input order without duplicates or affecting another creator", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "niches_owner");
    const otherId = await seedCreatorId(t, "niches_other");
    await t.run(async (ctx) => {
      await updateCreatorNiches(ctx, otherId, ["llms"]);
      await updateCreatorNiches(ctx, creatorId, ["databases"]);
      await updateCreatorNiches(ctx, creatorId, ["Web Development", "databases", "databases"]);
      await updateCreatorNiches(ctx, creatorId, ["web-development", "databases"]);
    });

    const rows = await t.run((ctx) => ctx.db.query("creatorNiches").take(10));
    expect(rows.map(({ creatorId, name }) => ({ creatorId, name }))).toEqual([
      { creatorId: otherId, name: "llms" },
      { creatorId, name: "web-development" },
      { creatorId, name: "databases" },
    ]);
    const names = await t.run(async (ctx) =>
      listCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
    );
    expect(names).toEqual(["web-development", "databases"]);
  });

  test("reads legacy niches and permanently clears them when given an empty selection", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "niches_legacy");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: ["ai-agents"] }));
    expect(
      await t.run(async (ctx) =>
        listCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
      ),
    ).toEqual(["ai-agents"]);

    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, []));

    const creator = await t.run((ctx) => ctx.db.get("creators", creatorId));
    expect(creator).not.toHaveProperty("niches");
    expect(await t.run((ctx) => listCreatorNiches(ctx, creator!))).toEqual([]);
  });

  test("invalid replacement leaves the existing selection unchanged", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "niches_invalid");
    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, ["databases"]));
    const before = await t.run((ctx) => ctx.db.query("creatorNiches").take(10));
    await expectApiError(
      () => t.run((ctx) => updateCreatorNiches(ctx, creatorId, ["unknown"])),
      "invalid_state",
      "invalid_niche",
    );
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual(before);
  });
});
