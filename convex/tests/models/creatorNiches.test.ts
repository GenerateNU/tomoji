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
    expect(await t.run((ctx) => listCreatorNiches(ctx, creatorId))).toEqual([
      "web-development",
      "databases",
    ]);
  });

  test("an empty selection clears every row", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "niches_clear");
    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, ["ai-agents"]));

    await t.run((ctx) => updateCreatorNiches(ctx, creatorId, []));

    expect(await t.run((ctx) => listCreatorNiches(ctx, creatorId))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(10))).toEqual([]);
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
