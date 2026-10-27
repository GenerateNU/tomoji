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

const backfillCreatorUsernames =
  internal.migrations["2026_09_26_backfill_creator_usernames"].backfillCreatorUsernames;
const backfillCreatorNiches =
  internal.migrations["2026_10_25_backfill_creator_niches"].backfillCreatorNiches;

afterEach(() => vi.useRealTimers());

function setup() {
  const t = convexTest(transitionSchema, modules);
  migrationsTest.register(t);
  return t;
}

async function readIdentityRows(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => ({
    users: await ctx.db.query("users").take(3),
    creators: await ctx.db.query("creators").take(3),
  }));
}

async function seedCreator(t: ReturnType<typeof setup>, workosId: string, username?: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workosId,
      firstName: "Legacy",
      lastName: "Runner",
      email: `${workosId}@example.com`,
      role: "creator",
      isActive: true,
    });
    return { userId, creatorId: await ctx.db.insert("creators", { userId, username }) };
  });
}

const generatedUsername = expect.stringMatching(/^creator_[0-9a-z]{12}$/);

describe("identity schema migrations", () => {
  test("runAll completes the registered backfill", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { creatorId } = await seedCreator(t, "workos_runner");
    await t.run(
      async (ctx) =>
        await ctx.db.patch("creators", creatorId, {
          niches: ["databases"],
        }),
    );

    await t.mutation(internal.migrations.runner.runAll, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await readIdentityRows(t);
    expect(rows.creators[0]).toMatchObject({ username: generatedUsername });
    expect(rows.creators[0]).not.toHaveProperty("niches");
    expect(await t.run((ctx) => ctx.db.query("creatorNiches").take(2))).toMatchObject([
      { creatorId: rows.creators[0]._id, name: "databases" },
    ]);
    const statuses = await t.query(components.migrations.lib.getStatus, {
      names: [getFunctionName(backfillCreatorUsernames), getFunctionName(backfillCreatorNiches)],
    });
    expect(statuses).toHaveLength(2);
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: getFunctionName(backfillCreatorUsernames),
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
    await seedCreator(t, "workos_selected");
    const before = await readIdentityRows(t);

    await t.mutation(internal.migrations.runner.run, {
      fn: getFunctionName(backfillCreatorUsernames),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await readIdentityRows(t);
    expect(after.users).toEqual(before.users);
    expect(after.creators[0]).toMatchObject({ username: generatedUsername });
    expect(await t.query(components.migrations.lib.getStatus, {})).toMatchObject([
      {
        name: getFunctionName(backfillCreatorUsernames),
        isDone: true,
        state: "success",
        processed: 1,
      },
    ]);
  });

  test("a restarted username backfill includes profiles created after the previous run", async () => {
    const t = setup();
    const runBackfill = async () =>
      await t.run(async (ctx) =>
        runToCompletion(ctx, components.migrations, backfillCreatorUsernames, { cursor: null }),
      );

    const first = await seedCreator(t, "first_creator");
    await runBackfill();
    const firstPass = await t.run(async (ctx) => ctx.db.get("creators", first.creatorId));
    const later = await seedCreator(t, "later_creator");

    await runBackfill();

    expect(await t.run(async (ctx) => ctx.db.get("creators", first.creatorId))).toEqual(firstPass);
    expect(await t.run(async (ctx) => ctx.db.get("creators", later.creatorId))).toMatchObject({
      userId: later.userId,
      username: generatedUsername,
    });
  });

  test.each(["my_custom_username", "creator_existing_id", ""])(
    "preserves an existing username %j",
    async (username) => {
      const t = setup();
      await seedCreator(t, "workos_current", username);
      const before = await readIdentityRows(t);

      await t.run(async (ctx) =>
        runToCompletion(ctx, components.migrations, backfillCreatorUsernames, { cursor: null }),
      );

      expect(await readIdentityRows(t)).toEqual(before);
    },
  );
});
