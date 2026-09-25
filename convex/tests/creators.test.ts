/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { getCreatorByUserId, updateCreatorProfile } from "../models/creators";
import { getUserByWorkosId } from "../models/users";
import schema from "../schema";
import { expectApiError, seedCreatorId, seedOperator, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("creators.me", () => {
  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.creators.me, {}), "not_authenticated");
  });

  test("returns all user-facing creator profile fields", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, {
      subject: "creator_me",
      email: "creator@example.com",
    });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "creator_me");
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

    expect(await asCreator.query(api.creators.me, {})).toEqual({
      creatorId,
      name: "Creator Name",
      email: "creator@example.com",
      profilePicture: "https://example.com/profile.png",
      xId: "creator_x",
      githubLink: "https://github.com/creator",
      phoneNumber: "+15555550123",
    });
  });

  test("omits optional fields that have not been set", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_me_optional" });

    const profile = await asCreator.query(api.creators.me, {});

    expect(profile).not.toHaveProperty("profilePicture");
    expect(profile).not.toHaveProperty("xId");
    expect(profile).not.toHaveProperty("githubLink");
    expect(profile).not.toHaveProperty("phoneNumber");
  });

  test("rejects a company caller", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "creator_me_company",
      org: { id: "org_creator_me" },
    });

    await expectApiError(() => asCompany.query(api.creators.me, {}), "forbidden");
  });

  test("rejects an operator caller", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "creator_me_operator");

    await expectApiError(() => asOperator.query(api.creators.me, {}), "forbidden");
  });
});

describe("creators.list", () => {
  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.query(api.creators.list, { paginationOpts: { cursor: null, numItems: 10 } }),
      "not_authenticated",
    );
  });

  test("rejects a creator caller", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_list_creator" });

    await expectApiError(
      () =>
        asCreator.query(api.creators.list, {
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      "forbidden",
    );
  });

  test("rejects an operator caller", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "creator_list_operator");

    await expectApiError(
      () =>
        asOperator.query(api.creators.list, {
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      "forbidden",
    );
  });

  test("lists creators across cursor-based pages for a company", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "creator_list_company",
      org: { id: "org_creator_list" },
    });
    await seedUser(t, { subject: "creator_list_1", email: "one@example.com" });
    await seedUser(t, { subject: "creator_list_2", email: "two@example.com" });

    const firstPage = await asCompany.query(api.creators.list, {
      paginationOpts: { cursor: null, numItems: 1 },
    });
    const secondPage = await asCompany.query(api.creators.list, {
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
    expect([...firstPage.page, ...secondPage.page].map((creator) => creator.email)).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
  });
});

describe("creators.get", () => {
  test("returns the requested creator profile for a company", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "creator_get_company",
      org: { id: "org_creator_get" },
    });
    await seedUser(t, { subject: "creator_get_target", email: "target@example.com" });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "creator_get_target");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      return creator._id;
    });

    expect(await asCompany.query(api.creators.get, { creatorId })).toEqual({
      creatorId,
      name: "target@example.com",
      email: "target@example.com",
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_get_signed_out_target");

    await expectApiError(() => t.query(api.creators.get, { creatorId }), "not_authenticated");
  });

  test("rejects a creator caller", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_get_creator" });
    const creatorId = await seedCreatorId(t, "creator_get_creator_target");

    await expectApiError(() => asCreator.query(api.creators.get, { creatorId }), "forbidden");
  });

  test("rejects an operator caller", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "creator_get_operator");
    const creatorId = await seedCreatorId(t, "creator_get_operator_target");

    await expectApiError(() => asOperator.query(api.creators.get, { creatorId }), "forbidden");
  });
});
