/// <reference types="vite/client" />
import { runToCompletion } from "@convex-dev/migrations";
import migrationsTest from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { components, internal } from "../../_generated/api";
import { migrateOpportunityNiches } from "../../migrations/2026_10_25_backfill_opportunity_niches";
import schema from "../../schema";
import { expectApiError, seedOpportunity } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

test("backfills legacy selections through the migration component without changing terms or skills", async () => {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  const owner = await seedOpportunity(t, { subject: "migration_tags" }, { skills: ["python"] });
  await t.run((ctx) =>
    ctx.db.patch("opportunities", owner.opportunityId, { niches: ["LLMs", "databases", "LLMs"] }),
  );
  const before = (await t.run((ctx) => ctx.db.get("opportunities", owner.opportunityId)))!;
  await t.run((ctx) =>
    runToCompletion(
      ctx,
      components.migrations,
      internal.migrations["2026_10_25_backfill_opportunity_niches"].backfillOpportunityNiches,
      { cursor: null },
    ),
  );
  const after = (await t.run((ctx) => ctx.db.get("opportunities", owner.opportunityId)))!;
  const { niches, ...unchanged } = before;
  expect(niches).toEqual(["LLMs", "databases", "LLMs"]);
  expect(after).toEqual(unchanged);
  const rows = await t.run((ctx) => ctx.db.query("opportunityNiches").take(10));
  expect(rows.map((row) => row.name)).toEqual(["llms", "databases"]);
  expect(await t.run((ctx) => ctx.db.query("opportunitySkills").take(10))).toMatchObject([
    { opportunityId: owner.opportunityId, name: "python" },
  ]);
  await t.run((ctx) => migrateOpportunityNiches(ctx, after));
  expect(await t.run((ctx) => ctx.db.query("opportunityNiches").take(10))).toEqual(rows);
});

test("empty legacy selections are removed without creating rows", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedOpportunity(t, { subject: "migration_empty" });
  await t.run((ctx) => ctx.db.patch("opportunities", owner.opportunityId, { niches: [] }));
  await t.run(async (ctx) =>
    migrateOpportunityNiches(ctx, (await ctx.db.get("opportunities", owner.opportunityId))!),
  );
  expect(await t.run((ctx) => ctx.db.get("opportunities", owner.opportunityId))).not.toHaveProperty(
    "niches",
  );
  expect(await t.run((ctx) => ctx.db.query("opportunityNiches").take(10))).toEqual([]);
});

test("invalid legacy names fail without discarding the source array", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedOpportunity(t, { subject: "migration_invalid" });
  await t.run((ctx) => ctx.db.patch("opportunities", owner.opportunityId, { niches: ["unknown"] }));
  const before = (await t.run((ctx) => ctx.db.get("opportunities", owner.opportunityId)))!;
  await expectApiError(
    () => t.run((ctx) => migrateOpportunityNiches(ctx, before)),
    "invalid_state",
    "invalid_niche",
  );
  expect(await t.run((ctx) => ctx.db.get("opportunities", owner.opportunityId))).toEqual(before);
});
