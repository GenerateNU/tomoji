/// <reference types="vite/client" />
import { runToCompletion } from "@convex-dev/migrations";
import migrationsTest from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { defineSchema, defineTable, queryGeneric } from "convex/server";
import { v, type Infer } from "convex/values";
import { describe, expect, test } from "vitest";
import { components, internal } from "../_generated/api";
import schema from "../schema";

// The temporary migration schema accepts existing documents and their replacements.
const transitionSchema = defineSchema({
  ...schema.tables,
  users: defineTable(
    schema.tables.users.validator.omit("firstName", "lastName").extend({
      name: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
    }),
  )
    .index("by_workosId", ["workosId"])
    .index("by_role", ["role"])
    .index("by_isActive", ["isActive"])
    .index("by_role_and_isActive", ["role", "isActive"]),
});

const modules = import.meta.glob("../**/*.ts");

const cachedAuthUser = v.object({
  id: v.string(),
  email: v.string(),
  firstName: v.optional(v.union(v.string(), v.null())),
  lastName: v.optional(v.union(v.string(), v.null())),
});

function setup(cachedUsers: Infer<typeof cachedAuthUser>[] = []) {
  const t = convexTest(transitionSchema, modules);
  migrationsTest.register(t);
  // Exercise the migration's cached-user query contract, without pulling the
  // AuthKit component's Workpool/Workflow implementation into application tests.
  t.registerComponent("workOSAuthKit", defineSchema({}), {
    "./_generated/server.ts": async () => ({}),
    "./lib.ts": async () => ({
      getAuthUser: queryGeneric({
        args: { id: v.string() },
        returns: v.union(cachedAuthUser, v.null()),
        handler: (_ctx, args) => cachedUsers.find((user) => user.id === args.id) ?? null,
      }),
    }),
  });
  return t;
}

async function runIdentityMigrations(t: ReturnType<typeof setup>) {
  await t.run(async (ctx) => {
    await runToCompletion(ctx, components.migrations, internal.migrations.backfillUserNames, {
      cursor: null,
    });
    await runToCompletion(
      ctx,
      components.migrations,
      internal.migrations.backfillCreatorUsernames,
      { cursor: null },
    );
  });
}

async function readIdentityRows(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => ({
    users: await ctx.db.query("users").take(3),
    creators: await ctx.db.query("creators").take(3),
  }));
}

describe("identity schema migrations", () => {
  test("a restarted username backfill includes profiles created after the previous run", async () => {
    const t = setup();
    const seedCreator = async (workosId: string) =>
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          workosId,
          email: `${workosId}@example.com`,
          role: "creator",
          isActive: true,
        });
        return { userId, creatorId: await ctx.db.insert("creators", { userId }) };
      });
    const runBackfill = async () =>
      await t.run(async (ctx) =>
        runToCompletion(ctx, components.migrations, internal.migrations.backfillCreatorUsernames, {
          cursor: null,
        }),
      );

    const first = await seedCreator("first_creator");
    await runBackfill();
    const firstPass = await t.run(async (ctx) => ctx.db.get("creators", first.creatorId));
    const later = await seedCreator("later_creator");

    await runBackfill();

    expect(await t.run(async (ctx) => ctx.db.get("creators", first.creatorId))).toEqual(firstPass);
    expect(await t.run(async (ctx) => ctx.db.get("creators", later.creatorId))).toMatchObject({
      userId: later.userId,
      username: `creator_${later.userId}`,
    });
  });

  test("backfills legacy rows from cached WorkOS names without replacing identities", async () => {
    const t = setup([
      {
        id: "workos_legacy",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    ]);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workosId: "workos_legacy",
        name: "Old Display Name",
        email: "ada@example.com",
        role: "operator",
        isActive: false,
        profilePicture: "https://example.com/avatar.jpg",
      });
      await ctx.db.insert("creators", {
        userId,
        xId: "retained-social-account",
        githubLink: "https://github.com/example",
        phoneNumber: "+15550102020",
      });
    });
    const before = await readIdentityRows(t);

    await runIdentityMigrations(t);

    const after = await readIdentityRows(t);
    const { name: legacyName, ...retainedUser } = before.users[0]!;
    expect(legacyName).toBe("Old Display Name");
    expect(after.users).toEqual([{ ...retainedUser, firstName: "Ada", lastName: "Lovelace" }]);
    const creator = before.creators[0]!;
    expect(after.creators).toEqual([{ ...creator, username: `creator_${creator.userId}` }]);
    expect(after.users[0]).not.toHaveProperty("name");

    // Restart from the beginning to verify the transformations, not just the
    // component's completed-migration shortcut, are safe to repeat.
    await runIdentityMigrations(t);
    expect(await readIdentityRows(t)).toEqual(after);
  });

  test("preserves the full legacy name when no cached WorkOS user exists", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workosId: "workos_uncached",
        name: "María del Carmen García",
        email: "maria@example.com",
        role: "creator",
        isActive: true,
      });
      await ctx.db.insert("creators", { userId });
    });

    await runIdentityMigrations(t);

    const after = await readIdentityRows(t);
    expect(after.users).toHaveLength(1);
    expect(after.creators).toHaveLength(1);
    expect(after.users[0]).toMatchObject({ firstName: "María del Carmen García", lastName: "" });
    expect(after.users[0]).not.toHaveProperty("name");
    expect(after.creators[0]).toMatchObject({
      userId: after.users[0]!._id,
      username: `creator_${after.users[0]!._id}`,
    });
  });

  test.each(["my_custom_username", "creator_existing_id", ""])(
    "preserves migrated name parts and username %j",
    async (username) => {
      const t = setup();
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          workosId: "workos_current",
          firstName: "",
          lastName: "Chosen Name",
          email: "current@example.com",
          role: "creator",
          isActive: true,
        });
        await ctx.db.insert("creators", { userId, username });
      });
      const before = await readIdentityRows(t);

      await runIdentityMigrations(t);

      expect(await readIdentityRows(t)).toEqual(before);
    },
  );
});
