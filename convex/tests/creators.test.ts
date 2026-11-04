/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { getCreatorByUserId, updateCreatorProfile } from "../models/creators";
import { getUserByWorkosId } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOperator,
  seedOpportunity,
  seedProfilePictureUpload,
  seedUser,
  seedXAccount,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("creators.me", () => {
  test.each([
    { firstName: "Ada", lastName: "" },
    { firstName: "Ada", lastName: "Lovelace" },
  ])("preserves separate name parts %j through a creator profile update", async (names) => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_names", ...names });
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "creator_names");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");
      return creator._id;
    });
    const expected = {
      creatorId,
      email: "creator_names@example.com",
      additionalLinks: [],
      isPrivate: false,
      niches: [],
      skills: [],
      ...names,
    };

    expect(await asCreator.query(api.creators.me, {})).toEqual(expected);
    expect(await asCreator.mutation(api.creators.update, {})).toEqual({
      ...expected,
    });
    expect(await asCreator.query(api.creators.me, {})).toEqual({ ...expected });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.creators.me, {}), "not_authenticated");
  });

  test("returns all user-facing creator profile fields", async () => {
    const t = convexTest(schema, modules);
    const { uploadId } = await seedProfilePictureUpload(t, "creator_me", "complete");
    const asCreator = await seedUser(t, {
      subject: "creator_me",
      email: "creator@example.com",
      firstName: "Creator",
      lastName: "Name",
    });
    await seedXAccount(t, "creator_me");
    const creatorId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "creator_me");
      if (user === null) throw new Error("expected seeded user");
      const creator = await getCreatorByUserId(ctx, user._id);
      if (creator === null) throw new Error("expected seeded creator");

      await updateCreatorProfile(ctx, user, {
        githubLink: "https://github.com/creator",
        linkedinLink: "https://www.linkedin.com/in/creator",
        additionalLinks: ["https://creator.example.com/"],
        dateOfBirth: Date.UTC(1990, 0, 1),
        countryOfResidence: "us",
        isPrivate: true,
      });
      return creator._id;
    });

    expect(await asCreator.query(api.creators.me, {})).toEqual({
      creatorId,
      firstName: "Creator",
      lastName: "Name",
      email: "creator@example.com",
      profilePictureMediaId: uploadId,
      xId: "123456789",
      githubLink: "https://github.com/creator",
      linkedinLink: "https://www.linkedin.com/in/creator",
      additionalLinks: ["https://creator.example.com/"],
      dateOfBirth: Date.UTC(1990, 0, 1),
      countryOfResidence: "US",
      isPrivate: true,
      niches: [],
      skills: [],
    });
  });

  test("omits optional fields that have not been set", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_me_optional" });

    const profile = await asCreator.query(api.creators.me, {});

    expect(profile).not.toHaveProperty("username");
    expect(profile).not.toHaveProperty("profilePicture");
    expect(profile).not.toHaveProperty("profilePictureMediaId");
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
    expect([...firstPage.page, ...secondPage.page].map((creator) => creator.email)).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
    // The filtered stream reports completion on the page after the last row.
    const thirdPage = await asCompany.query(api.creators.list, {
      paginationOpts: { cursor: secondPage.continueCursor, numItems: 1 },
    });
    expect(thirdPage.page).toEqual([]);
    expect(thirdPage.isDone).toBe(true);
  });

  test("skips duplicate-email accounts, which have no creator row, instead of throwing", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asCompany = await seedUser(t, {
      subject: "dup_list_company",
      org: { id: "org_dup_list" },
    });
    await seedUser(t, {
      subject: "dup_list_owner",
      email: "dup-creator@example.com",
    });
    await seedUser(t, {
      subject: "dup_list_claimant",
      email: "dup-creator@example.com",
    });

    const result = await asCompany.query(api.creators.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((creator) => creator.email)).toEqual(["dup-creator@example.com"]);
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
      firstName: "Test",
      lastName: "",
      email: "target@example.com",
      additionalLinks: [],
      isPrivate: false,
      niches: [],
      skills: [],
    });
  });

  // A birth date is the creator's own; a company browsing for creators has no
  // business reading it.
  test("never discloses a creator's date of birth to a company", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "dob_company",
      org: { id: "org_dob" },
    });
    await seedUser(t, { subject: "dob_target", email: "dob@example.com" });
    const creatorId = await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "dob_target"))!;
      const profile = await updateCreatorProfile(ctx, user, {
        dateOfBirth: Date.UTC(1990, 0, 1),
      });
      return profile.creatorId;
    });

    expect(await asCompany.query(api.creators.get, { creatorId })).not.toHaveProperty(
      "dateOfBirth",
    );
    const { page } = await asCompany.query(api.creators.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page).not.toHaveLength(0);
    for (const profile of page) expect(profile).not.toHaveProperty("dateOfBirth");
  });

  // The route derives the company from the caller's membership. The model
  // skips the privacy check entirely when no company is passed, so a route
  // that stopped forwarding it would expose every private creator.
  describe("private creators", () => {
    async function seedPrivateCreator(t: ReturnType<typeof convexTest>, subject: string) {
      const creatorId = await seedCreatorId(t, subject);
      await t.run(async (ctx) => await ctx.db.patch("creators", creatorId, { isPrivate: true }));
      return creatorId;
    }

    test("are not found by a company with no relationship", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedPrivateCreator(t, "route_private_target");
      const { asCompany } = await seedOpportunity(t, { subject: "route_unrelated_owner" });

      await expectApiError(() => asCompany.query(api.creators.get, { creatorId }), "not_found");
    });

    test("are returned to a company they applied to", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedPrivateCreator(t, "route_applicant");
      const { asCompany, opportunityId, membership } = await seedOpportunity(t, {
        subject: "route_applied_owner",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("applications", {
          opportunityId,
          creatorId,
          companyId: membership.companyId,
          status: "pending",
        });
      });

      expect(await asCompany.query(api.creators.get, { creatorId })).toMatchObject({
        creatorId,
        isPrivate: true,
      });
    });

    test("are returned to a company that assigned them", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedPrivateCreator(t, "route_assignee");
      const { asCompany, opportunityId } = await seedOpportunity(t, {
        subject: "route_assigned_owner",
      });
      await seedAssignment(t, { opportunityId, creatorId, status: "active" });

      expect(await asCompany.query(api.creators.get, { creatorId })).toMatchObject({
        creatorId,
        isPrivate: true,
      });
    });

    test("are left out of the list a company browses", async () => {
      const t = convexTest(schema, modules);
      const hiddenId = await seedPrivateCreator(t, "route_listed_private");
      const openId = await seedCreatorId(t, "route_listed_open");
      const { asCompany } = await seedOpportunity(t, { subject: "route_list_owner" });

      const { page } = await asCompany.query(api.creators.list, {
        paginationOpts: { cursor: null, numItems: 20 },
      });

      const listed = page.map((profile) => profile.creatorId);
      expect(listed).toContain(openId);
      expect(listed).not.toContain(hiddenId);
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

describe("creators.update", () => {
  test("updates only the caller's selections and returns them through me and company get", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_tags" });
    const asOther = await seedUser(t, { subject: "other_tags" });
    const asCompany = await seedUser(t, { subject: "company_tags", org: { id: "org_tags" } });
    const result = await asCreator.mutation(api.creators.update, {
      niches: ["databases"],
      skills: ["C#"],
    });
    expect(result).toMatchObject({ niches: ["databases"], skills: ["c-sharp"] });
    expect(await asCreator.query(api.creators.me, {})).toEqual(result);
    expect(await asCompany.query(api.creators.get, { creatorId: result.creatorId })).toEqual(
      result,
    );
    expect(await asOther.query(api.creators.me, {})).toMatchObject({ niches: [], skills: [] });
  });

  test("rejects manual X ID editing", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_manual_x" });
    // Deliberately bypass the client type to verify runtime argument validation.
    await expect(
      asCreator.mutation(api.creators.update, { xId: "forged" } as never),
    ).rejects.toThrow();
  });

  test("updates the authenticated creator's profile", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, {
      subject: "creator_update",
      email: "creator@example.com",
    });

    const profile = await asCreator.mutation(api.creators.update, {
      githubLink: "https://github.com/creator",
    });

    expect(profile).toMatchObject({
      firstName: "Test",
      lastName: "",
      email: "creator@example.com",
      githubLink: "https://github.com/creator",
    });
  });

  test("preserves omitted fields in a partial update", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_update_partial" });
    await asCreator.mutation(api.creators.update, {
      githubLink: "https://github.com/creator",
    });

    const profile = await asCreator.mutation(api.creators.update, {});

    expect(profile).toMatchObject({
      githubLink: "https://github.com/creator",
    });
  });

  test("clears profile fields when passed null", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_update_clear" });
    await asCreator.mutation(api.creators.update, {
      githubLink: "https://github.com/creator",
    });

    const profile = await asCreator.mutation(api.creators.update, {
      githubLink: null,
    });

    expect(profile).not.toHaveProperty("xId");
    expect(profile).not.toHaveProperty("githubLink");
    expect(profile).not.toHaveProperty("phoneNumber");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.mutation(api.creators.update, { skills: ["python"] }),
      "not_authenticated",
    );
  });

  test("rejects a company caller", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "creator_update_company",
      org: { id: "org_creator_update" },
    });

    await expectApiError(
      () => asCompany.mutation(api.creators.update, { skills: ["python"] }),
      "forbidden",
    );
  });

  test("rejects an operator caller", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "creator_update_operator");

    await expectApiError(
      () => asOperator.mutation(api.creators.update, { skills: ["python"] }),
      "forbidden",
    );
  });
});
