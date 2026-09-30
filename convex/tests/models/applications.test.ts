/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import { createApplication, listApplications, requireApplication } from "../../models/applications";
import schema from "../../schema";
import { expectApiError, seedCreatorId, seedOpportunity, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

/** Asserts a call fails with a specific API error reason. */
async function expectReason(call: () => Promise<unknown>, reason: string) {
  await expect(call()).rejects.toThrow(new RegExp(`"reason":"${reason}"`));
}

async function applyAs(
  t: TestConvex,
  creatorId: Awaited<ReturnType<typeof seedCreatorId>>,
  opportunityId: Awaited<ReturnType<typeof seedOpportunity>>["opportunityId"],
  note = "I film daily.",
) {
  return await t.run(
    async (ctx) => await createApplication(ctx, creatorId, { opportunityId, note }),
  );
}

describe("createApplication", () => {
  test("stores a pending application with the trimmed note", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");

    const id = await t.run(
      async (ctx) =>
        await createApplication(ctx, creatorId, { opportunityId, note: "  I film daily.  " }),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", id));

    expect(stored).toMatchObject({
      opportunityId,
      creatorId,
      note: "I film daily.",
      status: "pending",
    });
    expect(stored?.offerSentAt).toBeUndefined();
  });

  test("rejects an opportunity that does not exist", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    await t.run(async (ctx) => await ctx.db.delete("opportunities", opportunityId));

    await expectApiError(() => applyAs(t, creatorId, opportunityId), "not_found");
  });

  test.each<{
    name: string;
    opportunity?: Partial<WithoutSystemFields<Doc<"opportunities">>>;
    campaign?: Partial<WithoutSystemFields<Doc<"campaigns">>>;
    reason: string;
  }>([
    {
      name: "a draft opportunity",
      opportunity: { status: "draft" },
      reason: "opportunity_not_open",
    },
    {
      name: "a paused opportunity",
      opportunity: { status: "paused" },
      reason: "opportunity_not_open",
    },
    {
      name: "a closed opportunity",
      opportunity: { status: "closed" },
      reason: "opportunity_not_open",
    },
    {
      name: "an ungated opportunity",
      opportunity: { isGated: false },
      reason: "opportunity_not_gated",
    },
    { name: "a paused campaign", campaign: { status: "paused" }, reason: "campaign_not_open" },
    { name: "a closed campaign", campaign: { status: "closed" }, reason: "campaign_not_open" },
  ])("rejects $name", async ({ opportunity, campaign, reason }) => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { opportunity, campaign });
    const creatorId = await seedCreatorId(t, "creator_a");

    await expectReason(() => applyAs(t, creatorId, opportunityId), reason);
  });

  test.each([
    { name: "no note", note: undefined },
    { name: "a blank note", note: "   " },
  ])("stores an empty note when given $name", async ({ note }) => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");

    const id = await t.run(
      async (ctx) => await createApplication(ctx, creatorId, { opportunityId, note }),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", id));

    expect(stored?.note).toBe("");
  });

  test("rejects a second application from the same creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    await applyAs(t, creatorId, opportunityId);

    await expectApiError(() => applyAs(t, creatorId, opportunityId), "conflict");
  });

  test("allows the same creator to apply to a different opportunity", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t);
    const second = await seedOpportunity(t, { subject: "company_other", orgId: "org_other" });
    const creatorId = await seedCreatorId(t, "creator_a");

    await applyAs(t, creatorId, first.opportunityId);
    const secondApplicationId = await applyAs(t, creatorId, second.opportunityId);

    const secondApplication = await t.run(
      async (ctx) => await ctx.db.get("applications", secondApplicationId),
    );
    expect(secondApplication).toMatchObject({
      opportunityId: second.opportunityId,
      creatorId,
    });
  });

  test("allows a different creator to apply to the same opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);
    const otherCreatorId = await seedCreatorId(t, "creator_b");

    const applicationId = await applyAs(t, otherCreatorId, opportunityId);

    const stored = await t.run(async (ctx) => await ctx.db.get("applications", applicationId));
    expect(stored).toMatchObject({ opportunityId, creatorId: otherCreatorId });
  });

  test("rejects applications once maxApplications is reached, counting every status", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { opportunity: { maxApplications: 2 } });
    const rejectedId = await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);
    await t.run(
      async (ctx) => await ctx.db.patch("applications", rejectedId, { status: "rejected" }),
    );
    await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);
    const third = await seedCreatorId(t, "creator_c");

    await expectReason(() => applyAs(t, third, opportunityId), "applications_full");
  });
});

describe("requireApplication", () => {
  async function seedApplication(t: TestConvex) {
    const seeded = await seedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, seeded.opportunityId);
    return { ...seeded, creatorId, applicationId };
  }

  test("returns the application to the creator who submitted it", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedApplication(t);

    const application = await t.run(
      async (ctx) => await requireApplication(ctx, { role: "creator", creatorId }, applicationId),
    );

    expect(application).toMatchObject({ _id: applicationId, creatorId, status: "pending" });
  });

  test("returns the application to the company that owns the opportunity", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedApplication(t);

    const application = await t.run(
      async (ctx) => await requireApplication(ctx, { role: "company", companyId }, applicationId),
    );

    expect(application._id).toBe(applicationId);
  });

  test("returns any application to an operator", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);

    const application = await t.run(
      async (ctx) => await requireApplication(ctx, { role: "operator" }, applicationId),
    );

    expect(application._id).toBe(applicationId);
  });

  test("hides another creator's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const otherCreatorId = await seedCreatorId(t, "creator_b");

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await requireApplication(
              ctx,
              { role: "creator", creatorId: otherCreatorId },
              applicationId,
            ),
        ),
      "not_found",
    );
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const other = await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await requireApplication(
              ctx,
              { role: "company", companyId: other.companyId },
              applicationId,
            ),
        ),
      "not_found",
    );
  });

  test("returns not found for a deleted application", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    await t.run(async (ctx) => await ctx.db.delete("applications", applicationId));

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireApplication(ctx, { role: "operator" }, applicationId)),
      "not_found",
    );
  });
});

describe("listApplications", () => {
  const firstPage = { numItems: 10, cursor: null };

  test("returns only the creator's applications", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t);
    const second = await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
    const creatorId = await seedCreatorId(t, "creator_a");
    const olderId = await applyAs(t, creatorId, first.opportunityId);
    const newerId = await applyAs(t, creatorId, second.opportunityId);
    await applyAs(t, await seedCreatorId(t, "creator_b"), first.opportunityId);

    const result = await t.run(
      async (ctx) => await listApplications(ctx, { creatorId, paginationOpts: firstPage }),
    );

    expect(result.page.map((application) => application._id)).toEqual([newerId, olderId]);
    expect(result.isDone).toBe(true);
  });

  test("filters by status", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t);
    const second = await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
    const creatorId = await seedCreatorId(t, "creator_a");
    const rejectedId = await applyAs(t, creatorId, first.opportunityId);
    await applyAs(t, creatorId, second.opportunityId);
    await t.run(
      async (ctx) => await ctx.db.patch("applications", rejectedId, { status: "rejected" }),
    );

    const result = await t.run(
      async (ctx) =>
        await listApplications(ctx, { creatorId, status: "rejected", paginationOpts: firstPage }),
    );

    expect(result.page.map((application) => application._id)).toEqual([rejectedId]);
  });

  test("paginates with a cursor", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t);
    const second = await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
    const creatorId = await seedCreatorId(t, "creator_a");
    const olderId = await applyAs(t, creatorId, first.opportunityId);
    const newerId = await applyAs(t, creatorId, second.opportunityId);

    const page1 = await t.run(
      async (ctx) =>
        await listApplications(ctx, { creatorId, paginationOpts: { numItems: 1, cursor: null } }),
    );
    const page2 = await t.run(
      async (ctx) =>
        await listApplications(ctx, {
          creatorId,
          paginationOpts: { numItems: 1, cursor: page1.continueCursor },
        }),
    );

    expect(page1.page.map((application) => application._id)).toEqual([newerId]);
    expect(page2.page.map((application) => application._id)).toEqual([olderId]);
  });
});
