/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { migrateCreatorUsername } from "../../migrations/2026_09_26_backfill_creator_usernames";
import schema from "../../schema";
import { seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("migrateCreatorUsername", () => {
  test("retries a random username collision without changing its existing owner", async () => {
    const t = convexTest(schema, modules);
    const targetId = await seedCreatorId(t, "backfill_target");
    const ownerId = await seedCreatorId(t, "username_owner");
    const ownerBefore = await t.run(async (ctx) => {
      await ctx.db.patch("creators", ownerId, { username: "creator_000000000000" });
      return await ctx.db.get("creators", ownerId);
    });

    await t.run(async (ctx) => {
      const target = await ctx.db.get("creators", targetId);
      if (target === null) throw new Error("expected seeded creator");
      let randomCalls = 0;
      const random = vi
        .spyOn(Math, "random")
        .mockImplementation(() => (randomCalls++ < 12 ? 0 : 0.5));
      try {
        await migrateCreatorUsername(ctx, target);
      } finally {
        random.mockRestore();
      }
    });

    expect(await t.run((ctx) => ctx.db.get("creators", targetId))).toMatchObject({
      username: "creator_iiiiiiiiiiii",
    });
    expect(await t.run((ctx) => ctx.db.get("creators", ownerId))).toEqual(ownerBefore);
  });

  test.each([false, true])(
    "leaves both accounts unchanged after five collisions (legacy username: %s)",
    async (hasLegacyUsername) => {
      const t = convexTest(schema, modules);
      const targetId = await seedCreatorId(t, "backfill_target");
      const ownerId = await seedCreatorId(t, "username_owner");
      await t.run(async (ctx) => {
        const target = await ctx.db.get("creators", targetId);
        if (target === null) throw new Error("expected seeded creator");
        if (hasLegacyUsername) {
          await ctx.db.patch("creators", targetId, { username: `creator_${target.userId}` });
        }
        await ctx.db.patch("creators", ownerId, { username: "creator_000000000000" });
      });
      const readRows = () =>
        t.run(async (ctx) => ({
          users: await ctx.db.query("users").take(3),
          creators: await ctx.db.query("creators").take(3),
        }));
      const before = await readRows();
      let randomCalls = 0;

      await expect(
        t.run(async (ctx) => {
          const target = await ctx.db.get("creators", targetId);
          if (target === null) throw new Error("expected seeded creator");
          const random = vi.spyOn(Math, "random").mockReturnValue(0);
          try {
            await migrateCreatorUsername(ctx, target);
          } finally {
            randomCalls = random.mock.calls.length;
            random.mockRestore();
          }
        }),
      ).rejects.toMatchObject({
        data: { code: "conflict", reason: "username_generation_failed" },
      });

      expect(randomCalls).toBe(60);
      expect(await readRows()).toEqual(before);
    },
  );

  test("replaces a legacy user-ID username once while preserving the rest of the account", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "legacy_creator");
    const before = await t.run(async (ctx) => {
      const creator = await ctx.db.get("creators", creatorId);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.patch("creators", creatorId, {
        username: `creator_${creator.userId}`,
        xId: "retained-social-account",
      });
      return {
        user: await ctx.db.get("users", creator.userId),
        creator: await ctx.db.get("creators", creatorId),
      };
    });
    const runBackfill = () =>
      t.run(async (ctx) => {
        const creator = await ctx.db.get("creators", creatorId);
        if (creator === null) throw new Error("expected seeded creator");
        await migrateCreatorUsername(ctx, creator);
      });

    await runBackfill();

    const after = await t.run((ctx) => ctx.db.get("creators", creatorId));
    expect(after).toEqual({
      ...before.creator,
      username: expect.stringMatching(/^creator_[0-9a-z]{12}$/),
    });
    expect(after?.username).not.toContain(after?.userId);
    expect(await t.run((ctx) => ctx.db.get("users", after!.userId))).toEqual(before.user);

    await runBackfill();
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).toEqual(after);
  });
});
