/// <reference types="vite/client" />
import { runToCompletion } from "@convex-dev/migrations";
import migrationsTest from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { defineSchema, defineTable, getFunctionName } from "convex/server";
import { v } from "convex/values";
import { afterEach, describe, expect, test, vi } from "vitest";
import { components, internal } from "../../_generated/api";
import schema from "../../schema";

// Legacy backfills must run before the strict schema is deployed.
const transitionSchema = defineSchema({
  ...schema.tables,
  users: defineTable(
    schema.tables.users.validator.extend({
      profilePicture: v.optional(v.string()),
    }),
  )
    .index("by_workosId", ["workosId"])
    .index("by_role", ["role"])
    .index("by_isActive", ["isActive"])
    .index("by_role_and_isActive", ["role", "isActive"]),
});

const modules = import.meta.glob("../../**/*.ts");

const removeUserProfilePictures =
  internal.migrations["2026_10_07_remove_user_profile_pictures"].removeUserProfilePictures;
const backfillCreatorNiches =
  internal.migrations["2026_10_25_backfill_creator_niches"].backfillCreatorNiches;

afterEach(() => vi.useRealTimers());

function setup() {
  const t = convexTest(transitionSchema, modules);
  migrationsTest.register(t);
  return t;
}

async function seedUser(t: ReturnType<typeof setup>, workosId: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        workosId,
        firstName: "Legacy",
        lastName: "Runner",
        email: `${workosId}@example.com`,
        role: "creator",
        isActive: true,
        profilePicture: "https://example.com/legacy.png",
      }),
  );
}

describe("identity schema migrations", () => {
  test("runAll completes every registered migration", async () => {
    vi.useFakeTimers();
    const t = setup();
    const userId = await seedUser(t, "workos_runner");
    const creatorId = await t.run(
      async (ctx) =>
        await ctx.db.insert("creators", { userId, isPrivate: false, niches: ["databases"] }),
    );

    await t.mutation(internal.migrations.runner.runAll, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => ctx.db.get("users", userId))).not.toHaveProperty(
      "profilePicture",
    );
    expect(await t.run(async (ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty(
      "niches",
    );
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(2))).toMatchObject([
      { creatorId, name: "databases" },
    ]);
    const statuses = await t.query(components.migrations.lib.getStatus, {
      names: [getFunctionName(removeUserProfilePictures), getFunctionName(backfillCreatorNiches)],
    });
    expect(statuses).toHaveLength(2);
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: getFunctionName(removeUserProfilePictures),
          isDone: true,
          state: "success",
          processed: 1,
        }),
        expect.objectContaining({
          name: getFunctionName(backfillCreatorNiches),
          isDone: true,
          state: "success",
          processed: 1,
        }),
      ]),
    );
  });

  test("run executes only the migration selected by fn", async () => {
    vi.useFakeTimers();
    const t = setup();
    const userId = await seedUser(t, "workos_selected");

    await t.mutation(internal.migrations.runner.run, {
      fn: getFunctionName(removeUserProfilePictures),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => ctx.db.get("users", userId))).not.toHaveProperty(
      "profilePicture",
    );
    expect(await t.query(components.migrations.lib.getStatus, {})).toMatchObject([
      {
        name: getFunctionName(removeUserProfilePictures),
        isDone: true,
        state: "success",
        processed: 1,
      },
    ]);
  });

  test("a restarted migration includes users created after the previous run", async () => {
    const t = setup();
    const runMigration = async () =>
      await t.run(async (ctx) =>
        runToCompletion(ctx, components.migrations, removeUserProfilePictures, { cursor: null }),
      );

    const first = await seedUser(t, "first_user");
    await runMigration();
    const firstPass = await t.run(async (ctx) => ctx.db.get("users", first));
    const later = await seedUser(t, "later_user");

    await runMigration();

    expect(await t.run(async (ctx) => ctx.db.get("users", first))).toEqual(firstPass);
    expect(await t.run(async (ctx) => ctx.db.get("users", later))).not.toHaveProperty(
      "profilePicture",
    );
  });
});
