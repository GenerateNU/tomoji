/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  getCreatorByUserId,
  requireCreatorProfile,
  updateCreatorProfile,
} from "../../models/creators";
import { getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("getCreatorByUserId", () => {
  test("returns the creator row for the requested user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator" });

    const result = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator");
      if (user === null) throw new Error("expected seeded user");
      return { userId: user._id, creator: await getCreatorByUserId(ctx, user._id) };
    });

    expect(result.creator?.userId).toBe(result.userId);
  });

  test("returns null when the user has no creator row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_missing" });

    const creator = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_missing");
      if (user === null) throw new Error("expected seeded user");
      const existing = await getCreatorByUserId(ctx, user._id);
      if (existing === null) throw new Error("expected seeded creator");
      await ctx.db.delete("creators", existing._id);
      return await getCreatorByUserId(ctx, user._id);
    });

    expect(creator).toBeNull();
  });
});

describe("requireCreatorProfile", () => {
  test("reports a missing creator profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_profile_missing" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_profile_missing");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.delete("creators", creator._id);
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await getUserByWorkosId(ctx, "model_creator_profile_missing");
          if (user === null) throw new Error("expected seeded user");
          return await requireCreatorProfile(ctx, user);
        }),
      "not_found",
    );
  });
});

describe("updateCreatorProfile", () => {
  test("updates supplied fields and preserves omitted fields", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update" });

    const profile = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update");
      if (user === null) throw new Error("expected seeded user");
      await updateCreatorProfile(ctx, user, {
        xId: "old_x",
        githubLink: "https://github.com/original",
        phoneNumber: "+15555550123",
      });

      return await updateCreatorProfile(ctx, user, { xId: "new_x" });
    });

    expect(profile).toMatchObject({
      xId: "new_x",
      githubLink: "https://github.com/original",
      phoneNumber: "+15555550123",
    });
  });

  test("removes null fields while preserving omitted fields", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update_clear" });

    const profile = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update_clear");
      if (user === null) throw new Error("expected seeded user");
      await updateCreatorProfile(ctx, user, {
        xId: "old_x",
        githubLink: "https://github.com/original",
        phoneNumber: "+15555550123",
      });

      return await updateCreatorProfile(ctx, user, {
        xId: null,
        githubLink: "https://github.com/updated",
      });
    });

    expect(profile).not.toHaveProperty("xId");
    expect(profile).toMatchObject({
      githubLink: "https://github.com/updated",
      phoneNumber: "+15555550123",
    });
  });

  test("accepts an empty update without changing the profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update_empty" });

    const result = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update_empty");
      if (user === null) throw new Error("expected seeded user");
      const before = await getCreatorByUserId(ctx, user._id);
      await updateCreatorProfile(ctx, user, {});
      const after = await getCreatorByUserId(ctx, user._id);
      return { before, after };
    });

    expect(result.after).toEqual(result.before);
  });

  test("reports a missing creator profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update_missing" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update_missing");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.delete("creators", creator._id);
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await getUserByWorkosId(ctx, "model_creator_update_missing");
          if (user === null) throw new Error("expected seeded user");
          return await updateCreatorProfile(ctx, user, { xId: "missing" });
        }),
      "not_found",
    );
  });
});
