/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { listCreators, requireCreatorProfileById } from "../../models/creators";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOpportunity,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function makePrivate(t: TestConvex, creatorId: Id<"creators">) {
  await t.run(async (ctx) => await ctx.db.patch("creators", creatorId, { isPrivate: true }));
}

async function page(t: TestConvex) {
  return await t.run(
    async (ctx) => await listCreators(ctx, { paginationOpts: { cursor: null, numItems: 20 } }),
  );
}

describe("private creators", () => {
  test("are left out of the company-facing list", async () => {
    const t = convexTest(schema, modules);
    const openId = await seedCreatorId(t, "open_creator");
    const hiddenId = await seedCreatorId(t, "hidden_creator");
    await makePrivate(t, hiddenId);

    const { page: profiles } = await page(t);

    expect(profiles.map((profile) => profile.creatorId)).toEqual([openId]);
  });

  test("stay hidden from a company with no relationship", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await seedCreatorId(t, "hidden_2");
    await makePrivate(t, hiddenId);
    const { membership } = await seedOpportunity(t, { subject: "owner_2" });
    const companyId = membership.companyId;

    await expectApiError(
      () => t.run(async (ctx) => await requireCreatorProfileById(ctx, hiddenId, companyId)),
      "not_found",
    );
  });

  test("are visible to a company they applied to", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await seedCreatorId(t, "hidden_3");
    await makePrivate(t, hiddenId);
    const { opportunityId, membership } = await seedOpportunity(t, { subject: "owner_3" });
    const companyId = membership.companyId;
    await t.run(async (ctx) => {
      await ctx.db.insert("applications", {
        opportunityId,
        creatorId: hiddenId,
        companyId,
        status: "pending",
      });
    });

    const profile = await t.run(
      async (ctx) => await requireCreatorProfileById(ctx, hiddenId, companyId),
    );

    expect(profile.creatorId).toBe(hiddenId);
  });

  // An ungated opportunity is claimed without an application, so the company
  // can be mid-campaign with someone who never applied.
  test("are visible to a company that assigned them", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await seedCreatorId(t, "hidden_4");
    await makePrivate(t, hiddenId);
    const { opportunityId, membership } = await seedOpportunity(t, { subject: "owner_4" });
    const companyId = membership.companyId;
    await seedAssignment(t, { opportunityId, creatorId: hiddenId, status: "active" });

    const profile = await t.run(
      async (ctx) => await requireCreatorProfileById(ctx, hiddenId, companyId),
    );

    expect(profile.creatorId).toBe(hiddenId);
  });

  test("stay hidden from a company they applied to someone else through", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await seedCreatorId(t, "hidden_6");
    await makePrivate(t, hiddenId);
    const applied = await seedOpportunity(t, { subject: "owner_6a", orgId: "org_6a" });
    const other = await seedOpportunity(t, { subject: "owner_6b", orgId: "org_6b" });
    await t.run(async (ctx) => {
      await ctx.db.insert("applications", {
        opportunityId: applied.opportunityId,
        creatorId: hiddenId,
        companyId: applied.membership.companyId,
        status: "pending",
      });
    });

    await expectApiError(
      () =>
        t.run(
          async (ctx) => await requireCreatorProfileById(ctx, hiddenId, other.membership.companyId),
        ),
      "not_found",
    );
  });

  // Rows created before isPrivate existed have no value for it.
  test("a profile predating the field is treated as discoverable", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "legacy_creator");
    await t.run(async (ctx) => await ctx.db.patch("creators", creatorId, { isPrivate: undefined }));

    const profile = await t.run(async (ctx) => await requireCreatorProfileById(ctx, creatorId));

    expect(profile.isPrivate).toBe(false);
    expect(profile.additionalLinks).toEqual([]);
    const { page: profiles } = await page(t);
    expect(profiles.map((entry) => entry.creatorId)).toContain(creatorId);
  });

  test("remain visible to themselves and to callers with no company", async () => {
    const t = convexTest(schema, modules);
    const hiddenId = await seedCreatorId(t, "hidden_5");
    await makePrivate(t, hiddenId);

    const profile = await t.run(async (ctx) => await requireCreatorProfileById(ctx, hiddenId));

    expect(profile.isPrivate).toBe(true);
  });
});
