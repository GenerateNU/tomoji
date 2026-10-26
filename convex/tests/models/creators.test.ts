/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  getCreatorByUserId,
  hasCreatorActivity,
  listCreators,
  requireCreatorProfile,
  requireCreatorProfileById,
  updateCreatorProfile,
} from "../../models/creators";
import { deactivateUser, getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOpportunity,
  seedOperator,
  seedProfilePictureUpload,
  seedUser,
  seedXAccount,
  requireSeededUser,
} from "../helpers";

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
    const { uploadId } = await seedProfilePictureUpload(t, "model_creator_list", "complete");
    await seedUser(t, {
      subject: "model_creator_list",
      email: "creator@example.com",
      firstName: "Creator",
      lastName: "Name",
    });
    await seedXAccount(t, "model_creator_list");
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_list");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await updateCreatorProfile(ctx, user, {
        username: "creator_name",
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
        username: "creator_name",
        firstName: "Creator",
        lastName: "Name",
        email: "creator@example.com",
        profilePictureMediaId: uploadId,
        xId: "123456789",
        githubLink: "https://github.com/creator",
        phoneNumber: "+15555550123",
        niches: [],
        skills: [],
      },
    ]);
  });

  test("paginates complete creator profiles using the returned cursor", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "model_creator_page_1",
      email: "page-one@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    await seedUser(t, {
      subject: "model_creator_page_2",
      email: "page-two@example.com",
      firstName: "Grace",
      lastName: "Hopper",
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
      await updateCreatorProfile(ctx, firstUser, { niches: ["databases"], skills: ["typescript"] });
      await updateCreatorProfile(ctx, secondUser, {
        niches: ["web-development"],
        skills: ["python"],
      });
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
        firstName: "Ada",
        lastName: "Lovelace",
        email: "page-one@example.com",
        niches: ["databases"],
        skills: ["typescript"],
      },
    ]);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toEqual([
      {
        creatorId: secondCreatorId,
        firstName: "Grace",
        lastName: "Hopper",
        email: "page-two@example.com",
        niches: ["web-development"],
        skills: ["python"],
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
  test.each([true, false])(
    "rejects a username owned by another creator (active: %j) without changing either profile",
    async (isActive) => {
      const t = convexTest(schema, modules);
      await seedUser(t, { subject: "username_owner" });
      await seedUser(t, { subject: "username_claimant" });
      const { owner, claimant, beforeOwner, beforeClaimant } = await t.run(async (ctx) => {
        const owner = await getUserByWorkosId(ctx, "username_owner");
        const claimant = await getUserByWorkosId(ctx, "username_claimant");
        if (owner === null || claimant === null) throw new Error("expected seeded users");
        await updateCreatorProfile(ctx, owner, { username: "ada" });
        await updateCreatorProfile(ctx, claimant, { username: "grace", phoneNumber: "original" });
        if (!isActive) await deactivateUser(ctx, "username_owner");
        return {
          owner,
          claimant,
          beforeOwner: await getCreatorByUserId(ctx, owner._id),
          beforeClaimant: await getCreatorByUserId(ctx, claimant._id),
        };
      });

      await expectApiError(
        () =>
          t.run(async (ctx) =>
            updateCreatorProfile(ctx, claimant, { username: "  ADA  ", phoneNumber: "changed" }),
          ),
        "conflict",
      );

      expect(await t.run(async (ctx) => getCreatorByUserId(ctx, owner._id))).toEqual(beforeOwner);
      expect(await t.run(async (ctx) => getCreatorByUserId(ctx, claimant._id))).toEqual(
        beforeClaimant,
      );
    },
  );

  test("makes the old username available after its owner renames", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "renaming_owner" });
    await seedUser(t, { subject: "new_username_owner" });

    const profiles = await t.run(async (ctx) => {
      const owner = await getUserByWorkosId(ctx, "renaming_owner");
      const claimant = await getUserByWorkosId(ctx, "new_username_owner");
      if (owner === null || claimant === null) throw new Error("expected seeded users");
      await updateCreatorProfile(ctx, owner, { username: "ada" });
      await updateCreatorProfile(ctx, owner, { username: "augusta" });
      await updateCreatorProfile(ctx, claimant, { username: "  ADA  " });
      return {
        owner: await getCreatorByUserId(ctx, owner._id),
        claimant: await getCreatorByUserId(ctx, claimant._id),
      };
    });

    expect(profiles.owner?.username).toBe("augusta");
    expect(profiles.claimant?.username).toBe("ada");
  });

  test.each(["", "   ", "\t\n"])(
    "rejects blank username %j without changing the profile",
    async (username) => {
      const t = convexTest(schema, modules);
      await seedUser(t, { subject: "model_creator_blank_username" });
      const user = await t.run(
        async (ctx) => await getUserByWorkosId(ctx, "model_creator_blank_username"),
      );
      if (user === null) throw new Error("expected seeded user");
      const before = await t.run(async (ctx) => await getCreatorByUserId(ctx, user._id));

      await expectApiError(
        () =>
          t.run(
            async (ctx) =>
              await updateCreatorProfile(ctx, user, { username, phoneNumber: "changed" }),
          ),
        "invalid_state",
      );

      expect(await t.run(async (ctx) => await getCreatorByUserId(ctx, user._id))).toEqual(before);
    },
  );

  test("updates supplied fields and preserves omitted fields", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update" });

    const profile = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update");
      if (user === null) throw new Error("expected seeded user");
      await updateCreatorProfile(ctx, user, {
        username: "original",
        githubLink: "https://github.com/original",
        phoneNumber: "+15555550123",
      });

      return await updateCreatorProfile(ctx, user, { username: "updated" });
    });

    expect(profile).toMatchObject({
      username: "updated",
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
        username: "unchanged",
        githubLink: "https://github.com/original",
        phoneNumber: "+15555550123",
      });

      return await updateCreatorProfile(ctx, user, {
        phoneNumber: null,
        githubLink: "https://github.com/updated",
      });
    });

    expect(profile).not.toHaveProperty("phoneNumber");
    expect(profile).toMatchObject({
      username: "unchanged",
      githubLink: "https://github.com/updated",
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
          return await updateCreatorProfile(ctx, user, { username: "missing" });
        }),
      "not_found",
    );
  });
});

describe("requireCreatorProfileById", () => {
  test("returns all user-facing fields for an active creator", async () => {
    const t = convexTest(schema, modules);
    const { uploadId } = await seedProfilePictureUpload(t, "model_creator_get", "complete");
    await seedUser(t, {
      subject: "model_creator_get",
      email: "creator@example.com",
      firstName: "Creator",
      lastName: "Name",
    });
    await seedXAccount(t, "model_creator_get");

    const result = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_get");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await updateCreatorProfile(ctx, user, {
        username: "creator_name",
        githubLink: "https://github.com/creator",
        phoneNumber: "+15555550123",
      });
      return {
        creatorId: creator._id,
        profile: await requireCreatorProfileById(ctx, creator._id),
      };
    });

    expect(result.profile).toEqual({
      creatorId: result.creatorId,
      username: "creator_name",
      firstName: "Creator",
      lastName: "Name",
      email: "creator@example.com",
      profilePictureMediaId: uploadId,
      xId: "123456789",
      githubLink: "https://github.com/creator",
      phoneNumber: "+15555550123",
      niches: [],
      skills: [],
    });
  });

  test("reports a missing creator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_get_missing" });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_get_missing");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.delete("creators", creator._id);
      return creator._id;
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireCreatorProfileById(ctx, creatorId)),
      "not_found",
    );
  });

  test("hides a creator whose user is inactive", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_get_inactive" });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_get_inactive");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      await deactivateUser(ctx, "model_creator_get_inactive");
      return creator._id;
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireCreatorProfileById(ctx, creatorId)),
      "not_found",
    );
  });

  test("hides a creator row attached to a non-creator user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "model_creator_get_company",
      org: { id: "org_model_creator_get" },
    });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_get_company");
      if (user === null) throw new Error("expected seeded user");
      return await ctx.db.insert("creators", { userId: user._id, username: "non_creator" });
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireCreatorProfileById(ctx, creatorId)),
      "not_found",
    );
  });
});

describe("creator niches", () => {
  test("a skill-only update preserves legacy niches until they are backfilled", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "skills_legacy_niches");
    const user = await requireSeededUser(t, "skills_legacy_niches");
    await t.run((ctx) => ctx.db.patch("creators", creatorId, { niches: ["llms"] }));
    const profile = await t.run((ctx) => updateCreatorProfile(ctx, user, { skills: ["python"] }));
    expect(profile).toMatchObject({ niches: ["llms"], skills: ["python"] });
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).toHaveProperty("niches", [
      "llms",
    ]);
    expect(await t.run((ctx) => requireCreatorProfile(ctx, user))).toEqual(profile);
  });

  test("omitted selections survive an unrelated profile update", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "selections_omitted" });
    const user = await requireSeededUser(t, "selections_omitted");
    await t.run((ctx) =>
      updateCreatorProfile(ctx, user, { niches: ["databases"], skills: ["python"] }),
    );
    const profile = await t.run((ctx) =>
      updateCreatorProfile(ctx, user, { githubLink: "https://github.com/example" }),
    );
    expect(profile).toMatchObject({ niches: ["databases"], skills: ["python"] });
  });

  test("invalid skills roll back niche changes and other profile edits together", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "selections_atomic");
    const user = await requireSeededUser(t, "selections_atomic");
    await t.run((ctx) =>
      updateCreatorProfile(ctx, user, { niches: ["databases"], skills: ["python"] }),
    );
    const before = await t.run((ctx) => requireCreatorProfile(ctx, user));
    await expectApiError(
      () =>
        t.run((ctx) =>
          updateCreatorProfile(ctx, user, {
            niches: ["web-development"],
            skills: ["unknown"],
            username: "changed",
          }),
        ),
      "invalid_state",
      "invalid_skill",
    );
    expect(await t.run((ctx) => requireCreatorProfile(ctx, user))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty("username");
  });

  test("stores normalized niches and skills as separate associations", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_selections");
    const profile = await t.run(async (ctx) => {
      const creator = (await ctx.db.get("creators", creatorId))!;
      const user = (await ctx.db.get("users", creator.userId))!;
      return await updateCreatorProfile(ctx, user, {
        niches: ["Database Management", "databases"],
        skills: ["C++", "TypeScript", "C++"],
      });
    });

    expect(profile.niches).toEqual(["databases"]);
    expect(profile.skills).toEqual(["c-plus-plus", "typescript"]);
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty("niches");
  });

  test("creators set, replace, and clear their niches in their profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "niche_creator" });

    const profiles = await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "niche_creator"))!;
      return [
        await updateCreatorProfile(ctx, user, {
          niches: ["databases", "web-development", "databases"],
        }),
        await updateCreatorProfile(ctx, user, { username: "chef" }),
        await updateCreatorProfile(ctx, user, { niches: [] }),
        await requireCreatorProfile(ctx, user),
      ];
    });

    expect(profiles.map((profile) => profile.niches)).toEqual([
      ["databases", "web-development"],
      ["databases", "web-development"],
      [],
      [],
    ]);
  });

  test("a new creator's profile has no niches", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "niche_creator" });

    const profile = await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "niche_creator"))!;
      return await requireCreatorProfile(ctx, user);
    });

    expect(profile.niches).toEqual([]);
  });

  test("refuses a niche that isn't on the list without changing the profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "niche_creator" });

    await expect(
      t.run(async (ctx) => {
        const user = (await getUserByWorkosId(ctx, "niche_creator"))!;
        return await updateCreatorProfile(ctx, user, { niches: ["crypto"], username: "x" });
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_niche" } });
    const creator = await t.run(async (ctx) => await ctx.db.query("creators").first());
    expect(creator?.username).not.toBe("x");
    expect(creator).not.toHaveProperty("niches");
  });
});

describe("hasCreatorActivity", () => {
  test("is false for a creator with no X account, application, or assignment", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "idle_creator");

    expect(await t.run(async (ctx) => await hasCreatorActivity(ctx, creatorId))).toBe(false);
  });

  test("is true when the creator has a linked X account", async () => {
    const t = convexTest(schema, modules);
    const { creatorId } = await seedXAccount(t, "x_linked_creator");

    expect(await t.run(async (ctx) => await hasCreatorActivity(ctx, creatorId))).toBe(true);
  });

  test("is true when the creator has an application in a non-default status", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "applicant_creator");
    const { opportunityId, membership } = await seedOpportunity(t, {
      subject: "activity_owner",
    });
    await t.run(
      async (ctx) =>
        await ctx.db.insert("applications", {
          opportunityId,
          creatorId,
          companyId: membership.companyId,
          status: "rejected",
        }),
    );

    expect(await t.run(async (ctx) => await hasCreatorActivity(ctx, creatorId))).toBe(true);
  });

  test("is true when the creator has an assignment", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "assigned_creator");
    const { opportunityId } = await seedOpportunity(t, {
      subject: "assignment_owner",
    });
    await seedAssignment(t, { opportunityId, creatorId, status: "completed" });

    expect(await t.run(async (ctx) => await hasCreatorActivity(ctx, creatorId))).toBe(true);
  });

  test("ignores activity that belongs to another creator", async () => {
    const t = convexTest(schema, modules);
    const idleId = await seedCreatorId(t, "bystander_creator");
    await seedXAccount(t, "other_x_creator");

    expect(await t.run(async (ctx) => await hasCreatorActivity(ctx, idleId))).toBe(false);
  });
});
