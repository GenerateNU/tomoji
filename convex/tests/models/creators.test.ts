/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getCreatorByUserId, requireCreatorProfile } from "../../models/creators";
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
      await ctx.db.delete(existing._id);
      return await getCreatorByUserId(ctx, user._id);
    });

    expect(creator).toBeNull();
  });
});

describe("requireCreatorProfile", () => {
  test("rejects a non-creator profile request", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "model_company",
      org: { id: "org_model_creator" },
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await getUserByWorkosId(ctx, "model_company");
          if (user === null) throw new Error("expected seeded user");
          return await requireCreatorProfile(ctx, user);
        }),
      "forbidden",
    );
  });

  test("reports a missing creator profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_profile_missing" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_profile_missing");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.delete(creator._id);
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
