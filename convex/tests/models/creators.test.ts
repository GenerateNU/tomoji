/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  getCreatorByUserId,
  listCreators,
  requireCreatorProfile,
  updateCreatorProfile,
} from "../../models/creators";
import { deactivateUser, getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedOperator, seedUser } from "../helpers";

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

describe("listCreators", () => {
  test("returns full creator profiles", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_list", email: "creator@example.com" });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_list");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.patch("users", user._id, {
        name: "Creator Name",
        profilePicture: "https://example.com/profile.png",
      });
      await updateCreatorProfile(ctx, user, {
        xId: "creator_x",
        githubLink: "https://github.com/creator",
        phoneNumber: "+15555550123",
      });
      return creator._id;
    });

    const result = await t.run(async (ctx) =>
      listCreators(ctx, { paginationOpts: { cursor: null, numItems: 10 } }),
    );

    expect(result.page).toEqual([
      {
        creatorId,
        name: "Creator Name",
        email: "creator@example.com",
        profilePicture: "https://example.com/profile.png",
        xId: "creator_x",
        githubLink: "https://github.com/creator",
        phoneNumber: "+15555550123",
      },
    ]);
  });

  test("paginates complete creator profiles using the returned cursor", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "model_creator_page_1",
      email: "page-one@example.com",
    });
    await seedUser(t, {
      subject: "model_creator_page_2",
      email: "page-two@example.com",
    });
    const [firstCreatorId, secondCreatorId] = await t.run(async (ctx) => {
      const firstUser = await getUserByWorkosId(ctx, "model_creator_page_1");
      const secondUser = await getUserByWorkosId(ctx, "model_creator_page_2");
      if (firstUser === null || secondUser === null) throw new Error("expected seeded users");
      const firstCreator = await getCreatorByUserId(ctx, firstUser._id);
      const secondCreator = await getCreatorByUserId(ctx, secondUser._id);
      if (firstCreator === null || secondCreator === null) {
        throw new Error("expected seeded creators");
      }
      return [firstCreator._id, secondCreator._id] as const;
    });

    const firstPage = await t.run(async (ctx) =>
      listCreators(ctx, { paginationOpts: { cursor: null, numItems: 1 } }),
    );
    const secondPage = await t.run(async (ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      }),
    );

    expect(firstPage.page).toEqual([
      {
        creatorId: firstCreatorId,
        name: "page-one@example.com",
        email: "page-one@example.com",
      },
    ]);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toEqual([
      {
        creatorId: secondCreatorId,
        name: "page-two@example.com",
        email: "page-two@example.com",
      },
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  test("excludes inactive and non-creator accounts", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_list_active" });
    await seedUser(t, { subject: "model_creator_list_inactive" });
    await t.run(async (ctx) => deactivateUser(ctx, "model_creator_list_inactive"));
    await seedUser(t, {
      subject: "model_creator_list_company",
      org: { id: "org_model_creator_list" },
    });
    await seedOperator(t, "model_creator_list_operator");

    const result = await t.run(async (ctx) =>
      listCreators(ctx, { paginationOpts: { cursor: null, numItems: 10 } }),
    );

    expect(result.page.map((creator) => creator.email)).toEqual([
      "model_creator_list_active@example.com",
    ]);
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
