/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { migrateCreatorNiches } from "../../migrations/2026_10_25_backfill_creator_niches";
import { updateCreatorNiches } from "../../models/creatorNiches";
import schema from "../../schema";
import { expectApiError, seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("migrateCreatorNiches", () => {
  test("removes an empty legacy array without creating associations", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_empty_niches");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: [] }));
    await t.run(async (ctx) =>
      migrateCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
    );
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty("niches");
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual([]);
  });

  test("moves legacy selections once, preserving identity and other profile fields", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_niches");
    await t.run((ctx) =>
      ctx.db.patch("creators", creatorId, {
        niches: ["LLMs", "databases", "LLMs"],
        githubLink: "https://github.com/example",
      }),
    );
    const before = (await t.run((ctx) => ctx.db.get("creators", creatorId)))!;
    await t.run((ctx) => migrateCreatorNiches(ctx, before));

    const after = (await t.run((ctx) => ctx.db.get("creators", creatorId)))!;
    const { niches, ...unchangedFields } = before;
    expect(niches).toEqual(["LLMs", "databases", "LLMs"]);
    expect(after).toEqual(unchangedFields);
    const rows = await t.run((ctx) => ctx.db.query("creatorNiches").take(10));
    expect(rows.map(({ creatorId, name }) => ({ creatorId, name }))).toEqual([
      { creatorId, name: "llms" },
      { creatorId, name: "databases" },
    ]);

    await t.run((ctx) => migrateCreatorNiches(ctx, after));
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual(rows);
  });

  test("does not resurrect selections cleared before the backfill runs", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_cleared");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: ["llms"] }));
    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, []));
    await t.run(async (ctx) =>
      migrateCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
    );
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty("niches");
  });

  test("does not overwrite selections updated after the creator was migrated", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_edited");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: ["llms"] }));
    await t.run(async (ctx) =>
      migrateCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
    );
    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, ["databases"]));
    const rows = await t.run((ctx) => ctx.db.query("creatorNiches").take(10));

    await t.run(async (ctx) =>
      migrateCreatorNiches(ctx, (await ctx.db.get("creators", creatorId))!),
    );
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual(rows);
    expect(rows.map((row) => row.name)).toEqual(["databases"]);
  });

  test("rejects excessive legacy selections without truncating or clearing them", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_excessive");
    const niches = ["llms", "ai-agents", "databases", "web-development", "devops", "design"];
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches }));
    const before = (await t.run((ctx) => ctx.db.get("creators", creatorId)))!;

    await expectApiError(
      () => t.run((ctx) => migrateCreatorNiches(ctx, before)),
      "invalid_state",
      "too_many_niches",
    );
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual([]);
  });

  test("rejects unknown legacy values without losing the original data", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "backfill_invalid");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: ["unknown"] }));
    const before = (await t.run((ctx) => ctx.db.get("creators", creatorId)))!;
    await expectApiError(
      () => t.run((ctx) => migrateCreatorNiches(ctx, before)),
      "invalid_state",
      "invalid_niche",
    );
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual([]);
  });
});
