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
import { NICHES } from "../../models/niches";
import { SKILLS } from "../../models/skills";
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
  test("paginates fully populated profiles within Convex transaction limits", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const niches = NICHES.slice(0, 5).map((niche) => niche.name);
    const skills = SKILLS.map((skill) => skill.name);
    for (let index = 0; index < 210; index++) {
      const subject = `creator_full_${index}`;
      await seedUser(t, { subject });
      const user = await requireSeededUser(t, subject);
      await t.run((ctx) => updateCreatorProfile(ctx, user, { niches, skills }));
    }

    const first = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: null, numItems: 1000, maximumRowsRead: 10000 },
      }),
    );
    expect(first.page).toHaveLength(100);
    expect(first.isDone).toBe(false);
    expect(first.page[0]).toMatchObject({ niches, skills });
    const second = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: first.continueCursor, numItems: 1000, maximumRowsRead: 10000 },
      }),
    );
    expect(second.page).toHaveLength(100);
    expect(second.isDone).toBe(false);
    const third = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: second.continueCursor, numItems: 1000, maximumRowsRead: 10000 },
      }),
    );
    expect(third.page).toHaveLength(10);
    expect(third.isDone).toBe(true);
    expect([...first.page, ...second.page, ...third.page].map((profile) => profile.email)).toEqual(
      Array.from({ length: 210 }, (_, index) => `creator_full_${index}@example.com`),
    );
  }, 60_000);

  test("caps default and oversized read budgets while preserving cursor pagination", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 101; index++) {
      await seedUser(t, { subject: `creator_budget_${index}` });
    }

    const defaultPage = await t.run((ctx) =>
      listCreators(ctx, { paginationOpts: { cursor: null, numItems: 1000 } }),
    );
    expect(defaultPage.page).toHaveLength(100);
    expect(defaultPage.isDone).toBe(false);

    const firstPage = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: null, numItems: 1000, maximumRowsRead: 10000 },
      }),
    );
    expect(firstPage.page).toEqual(defaultPage.page);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: {
          cursor: firstPage.continueCursor,
          numItems: 1000,
          maximumRowsRead: 10000,
        },
      }),
    );
    const lastUser = await requireSeededUser(t, "creator_budget_100");
    const lastCreatorId = await t.run(
      async (ctx) => (await getCreatorByUserId(ctx, lastUser._id))!._id,
    );
    expect(secondPage.page).toEqual([
      {
        creatorId: lastCreatorId,
        firstName: "Test",
        lastName: "",
        email: "creator_budget_100@example.com",
        additionalLinks: [],
        isPrivate: false,
        niches: [],
        skills: [],
      },
    ]);
    expect(secondPage.isDone).toBe(true);

    const smallPage = await t.run((ctx) =>
      listCreators(ctx, {
        paginationOpts: { cursor: null, numItems: 10, maximumRowsRead: 1 },
      }),
    );
    expect(smallPage.page).toEqual(firstPage.page.slice(0, 1));
    expect(smallPage.isDone).toBe(false);
  });

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
        githubLink: "https://github.com/creator",
      });
      return creator._id;
    });

    const result = await t.run(async (ctx) =>
      listCreators(ctx, { paginationOpts: { cursor: null, numItems: 10 } }),
    );

    expect(result.page).toEqual([
      {
        creatorId,
        firstName: "Creator",
        lastName: "Name",
        email: "creator@example.com",
        profilePictureMediaId: uploadId,
        xId: "123456789",
        githubLink: "https://github.com/creator",
        additionalLinks: [],
        isPrivate: false,
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
        additionalLinks: [],
        isPrivate: false,
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
        additionalLinks: [],
        isPrivate: false,
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
  test("updates supplied fields and preserves omitted fields", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update" });

    const profile = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update");
      if (user === null) throw new Error("expected seeded user");
      await updateCreatorProfile(ctx, user, {
        githubLink: "https://github.com/original",
      });

      return await updateCreatorProfile(ctx, user, {});
    });

    expect(profile).toMatchObject({
      githubLink: "https://github.com/original",
    });
  });

  test("removes null fields while preserving omitted fields", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "model_creator_update_clear" });

    const profile = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "model_creator_update_clear");
      if (user === null) throw new Error("expected seeded user");
      await updateCreatorProfile(ctx, user, {
        githubLink: "https://github.com/original",
      });

      return await updateCreatorProfile(ctx, user, {
        githubLink: "https://github.com/updated",
      });
    });

    expect(profile).not.toHaveProperty("phoneNumber");
    expect(profile).toMatchObject({
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
          return await updateCreatorProfile(ctx, user, {});
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
        githubLink: "https://github.com/creator",
      });
      return {
        creatorId: creator._id,
        profile: await requireCreatorProfileById(ctx, creator._id),
      };
    });

    expect(result.profile).toEqual({
      creatorId: result.creatorId,
      firstName: "Creator",
      lastName: "Name",
      email: "creator@example.com",
      profilePictureMediaId: uploadId,
      xId: "123456789",
      githubLink: "https://github.com/creator",
      additionalLinks: [],
      isPrivate: false,
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
      return await ctx.db.insert("creators", { userId: user._id, isPrivate: false });
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
            githubLink: "https://github.com/rolled-back",
          }),
        ),
      "invalid_state",
      "invalid_skill",
    );
    expect(await t.run((ctx) => requireCreatorProfile(ctx, user))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.get("creators", creatorId))).not.toHaveProperty(
      "githubLink",
    );
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
        await updateCreatorProfile(ctx, user, {}),
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
        return await updateCreatorProfile(ctx, user, { niches: ["crypto"] });
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_niche" } });
    const creator = await t.run(async (ctx) => await ctx.db.query("creators").first());
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
