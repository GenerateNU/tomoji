/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { getCreatorByUserId, updateCreatorProfile } from "../models/creators";
import { getUserByWorkosId } from "../models/users";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser } from "./helpers";

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

  test("reports a missing creator profile", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_me_missing" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "creator_me_missing");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.delete("creators", creator._id);
    });

    await expectApiError(() => asCreator.query(api.creators.me, {}), "not_found");
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
