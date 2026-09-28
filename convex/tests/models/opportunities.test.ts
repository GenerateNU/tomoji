/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createOpportunity,
  discoverOpportunities,
  listOpportunities,
  publishOpportunity,
  removeOpportunity,
  requireOpportunity,
  updateOpportunity,
} from "../../models/opportunities";
import { authedContext } from "../../lib/functions";
import schema from "../../schema";
import {
  expectApiError,
  opportunityArgs,
  seedCampaign,
  seedCreatorId,
  seedOpportunity,
  seedUser,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("publishOpportunity", () => {
  test("rejects an already open opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" });
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
  });

  test("rejects a paused opportunity without resuming it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "paused" });
  });

  test("rejects a closed opportunity without reopening it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "closed" }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "closed" });
  });

  test("rejects a draft under a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_owner", status: "paused" },
      { status: "draft" },
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "draft" });
  });

  test("rejects a draft under a draft campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_owner", status: "draft" },
      { status: "draft" },
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
  });

  test("rejects a draft under a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(
      async (ctx) => await ctx.db.patch("campaigns", owner.campaignId, { status: "closed" }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
  });

  test("rejects a draft whose deadline has elapsed since creation", async () => {
    const t = convexTest(schema, modules);
    const deadline = Date.now() + 60_000;
    const owner = await seedOpportunity(
      t,
      { subject: "publish_owner" },
      { status: "draft", deadline },
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    vi.setSystemTime(deadline);
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("conceals a missing opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", owner.opportunityId));
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
  });

  test("conceals a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", owner.campaignId));
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
  });

  test("conceals an inconsistent campaign/company link", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    const other = await seedCampaign(t, { subject: "publish_other", orgId: "org_other" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { campaignId: other.campaignId }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
  });

  test("conceals a draft belonging to an inactive company", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("companies", owner.membership.companyId, { isActive: false }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
  });

  test("revalidates legacy blank brief text without publishing it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { description: "  " }),
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("revalidates legacy fractional compensation", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { cpmRateCents: 0.5 }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
  });

  test("revalidates legacy zero capacity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { maxSlots: 0 }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
  });

  test("publishes a draft and preserves the rest of the document and campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_owner" },
      { status: "draft", isGated: true },
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    const campaign = await t.run(async (ctx) => await ctx.db.get("campaigns", owner.campaignId));

    const result = await t.run(
      async (ctx) => await publishOpportunity(ctx, owner.membership, owner.opportunityId),
    );

    expect(result).toEqual({ ...before, status: "open" });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
    expect(await t.run(async (ctx) => await ctx.db.get("campaigns", owner.campaignId))).toEqual(
      campaign,
    );
  });
});

describe("removeOpportunity", () => {
  test("conceals a draft whose company is inactive", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("companies", owner.membership.companyId, { isActive: false }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).not.toBeNull();
  });

  test("conceals a draft whose campaign is missing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", owner.campaignId));
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).not.toBeNull();
  });

  test("rejects an inconsistent draft with filled slots", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { numFilledSlots: 1 }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ numFilledSlots: 1 });
  });

  test("rejects an open opportunity without changing it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a paused opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "paused" });
  });

  test("rejects a closed opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "closed" }),
    );
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "closed" });
  });

  test("preserves a draft and its declined application", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const creatorId = await seedCreatorId(t, "remove_creator");
    const applicationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("applications", {
          opportunityId: owner.opportunityId,
          creatorId,
          note: "Interested",
          status: "declined",
        }),
    );
    const before = await t.run(async (ctx) => ({
      opportunity: await ctx.db.get("opportunities", owner.opportunityId),
      application: await ctx.db.get("applications", applicationId),
    }));

    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => ({
        opportunity: await ctx.db.get("opportunities", owner.opportunityId),
        application: await ctx.db.get("applications", applicationId),
      })),
    ).toEqual(before);
  });

  test("preserves a draft and its cancelled assignment even without an application", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const creatorId = await seedCreatorId(t, "remove_creator");
    const assignmentId = await t.run(
      async (ctx) =>
        await ctx.db.insert("assignments", {
          opportunityId: owner.opportunityId,
          creatorId,
          fixedFeeCents: 10_000,
          cpmRateCents: 500,
          paymentCapCents: 25_000,
          usesAiReview: true,
          status: "cancelled",
        }),
    );
    const before = await t.run(async (ctx) => ({
      opportunity: await ctx.db.get("opportunities", owner.opportunityId),
      assignment: await ctx.db.get("assignments", assignmentId),
    }));

    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => ({
        opportunity: await ctx.db.get("opportunities", owner.opportunityId),
        assignment: await ctx.db.get("assignments", assignmentId),
      })),
    ).toEqual(before);
  });

  test("conceals a missing opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", owner.opportunityId));
    await expectApiError(
      () =>
        t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId)),
      "not_found",
    );
  });

  test("can clean up an unused draft in a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(
      async (ctx) => await ctx.db.patch("campaigns", owner.campaignId, { status: "closed" }),
    );
    await t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId));
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toBeNull();
    expect(
      await t.run(async (ctx) => await ctx.db.get("campaigns", owner.campaignId)),
    ).toMatchObject({ status: "closed" });
  });

  test("deletes only the unused draft and preserves its campaign and sibling", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const siblingId = await t.run(
      async (ctx) =>
        await createOpportunity(ctx, owner.membership, opportunityArgs(owner.campaignId)),
    );
    const before = await t.run(async (ctx) => ({
      campaign: await ctx.db.get("campaigns", owner.campaignId),
      sibling: await ctx.db.get("opportunities", siblingId),
    }));

    await t.run(async (ctx) => await removeOpportunity(ctx, owner.membership, owner.opportunityId));

    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toBeNull();
    expect(
      await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", owner.campaignId),
        sibling: await ctx.db.get("opportunities", siblingId),
      })),
    ).toEqual(before);
  });
});

describe("updateOpportunity", () => {
  test("conceals an opportunity whose campaign is missing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", owner.campaignId));

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              title: "New title",
            }),
        ),
      "not_found",
    );
  });

  test("updates brief, capacity, schedule, and defaults on a paused opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", owner.opportunityId, {
        status: "paused",
        numFilledSlots: 2,
      });
      await ctx.db.patch("campaigns", owner.campaignId, { status: "paused" });
    });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    const updates = {
      description: "  Show the evening routine.  ",
      targetApplicant: "Lifestyle creators",
      contentRequirements: "Two videos",
      prohibitedClaims: "No health claims",
      disclosureRequirements: "Include #ad",
      usageRights: "Organic reposting for 60 days",
      isGated: true,
      usesAiReviewDefault: false,
      maxSlots: 2,
      maxApplications: 2,
      deadline: Date.now() + 172_800_000,
      fixedFeeCents: 20_000,
      cpmRateCents: 0,
      paymentCapCents: 40_000,
      productAccessLink: "https://example.com/product",
    };

    const result = await t.run(
      async (ctx) => await updateOpportunity(ctx, owner.membership, owner.opportunityId, updates),
    );

    expect(result).toEqual({ ...before, ...updates, description: "Show the evening routine." });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });

  test("accepts an empty patch without changing the document", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    const result = await t.run(
      async (ctx) => await updateOpportunity(ctx, owner.membership, owner.opportunityId, {}),
    );

    expect(result).toEqual(before);
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("removes a null product link and preserves omitted fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "update_owner" },
      { productAccessLink: "https://example.com/product" },
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    await t.run(
      async (ctx) =>
        await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
          productAccessLink: null,
        }),
    );

    const stored = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    expect(stored).toEqual({ ...before, productAccessLink: undefined });
    expect(stored).not.toHaveProperty("productAccessLink");
  });

  test("preserves existing assignment terms when opportunity defaults change", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const creatorId = await seedCreatorId(t, "assigned_creator");
    const assignmentId = await t.run(
      async (ctx) =>
        await ctx.db.insert("assignments", {
          opportunityId: owner.opportunityId,
          creatorId,
          fixedFeeCents: 15_000,
          cpmRateCents: 750,
          paymentCapCents: 35_000,
          usesAiReview: true,
          status: "active",
        }),
    );
    const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

    const result = await t.run(
      async (ctx) =>
        await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
          fixedFeeCents: 20_000,
          cpmRateCents: 1_000,
          paymentCapCents: 50_000,
          usesAiReviewDefault: false,
        }),
    );

    expect(result).toMatchObject({
      fixedFeeCents: 20_000,
      cpmRateCents: 1_000,
      paymentCapCents: 50_000,
      usesAiReviewDefault: false,
    });
    expect(await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId))).toEqual(
      before,
    );
  });

  test("rejects invalid compensation without partially changing the brief", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              title: "Changed title",
              fixedFeeCents: -1,
            }),
        ),
      "invalid_state",
    );

    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a blank description", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              description: "  ",
            }),
        ),
      "invalid_state",
    );
  });

  test("rejects capacity below filled slots", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { numFilledSlots: 3 }),
    );
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, { maxSlots: 2 }),
        ),
      "invalid_state",
    );
  });

  test("rejects a nonpositive application limit", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              maxApplications: 0,
            }),
        ),
      "invalid_state",
    );
  });

  test("rejects an application limit above available slots", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              maxApplications: 6,
            }),
        ),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects extending a deadline beyond the campaign end", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await t.run(
      async (ctx) =>
        await ctx.db.patch("campaigns", owner.campaignId, { endsAt: Date.now() + 86_400_000 }),
    );

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              deadline: Date.now() + 172_800_000,
            }),
        ),
      "invalid_state",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a deadline at the current time for an open opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              deadline: Date.now(),
            }),
        ),
      "invalid_state",
    );
  });

  test("rejects an elapsed replacement deadline for a paused opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              deadline: Date.now() - 1,
            }),
        ),
      "invalid_state",
    );
  });

  test("permits an elapsed draft deadline but rejects a nonfinite one", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" }, { status: "draft" });
    const result = await t.run(
      async (ctx) =>
        await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
          deadline: Date.now() - 1,
        }),
    );
    expect(result.deadline).toBe(Date.now() - 1);
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              deadline: Infinity,
            }),
        ),
      "invalid_state",
    );
  });

  test("rejects edits to a closed opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "closed" }),
    );
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              title: "New title",
            }),
        ),
      "invalid_state",
    );
  });

  test("rejects edits under a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("campaigns", owner.campaignId, { status: "closed" }),
    );
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              title: "New title",
            }),
        ),
      "invalid_state",
    );
  });

  test("conceals a missing opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", owner.opportunityId));
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
              title: "New title",
            }),
        ),
      "not_found",
    );
  });

  test("updates supplied fields and preserves the rest of the opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    const result = await t.run(
      async (ctx) =>
        await updateOpportunity(ctx, owner.membership, owner.opportunityId, {
          title: "  Evening routine  ",
          fixedFeeCents: 0,
        }),
    );

    expect(result).toEqual({ ...before, title: "Evening routine", fixedFeeCents: 0 });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });
});

describe("discoverOpportunities", () => {
  test("returns an empty finished page when there are no open opportunities", async () => {
    const t = convexTest(schema, modules);
    await seedOpportunity(t, { subject: "discover_draft" }, { status: "draft" });

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test("excludes draft, paused, and closed opportunities", async () => {
    const t = convexTest(schema, modules);
    const open = await seedOpportunity(t, { subject: "discover_open" });
    await seedOpportunity(t, { subject: "discover_draft" }, { status: "draft" });
    const paused = await seedOpportunity(t, { subject: "discover_paused" });
    const closed = await seedOpportunity(t, { subject: "discover_closed" });
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", paused.opportunityId, { status: "paused" });
      await ctx.db.patch("opportunities", closed.opportunityId, { status: "closed" });
    });

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toMatchObject([{ _id: open.opportunityId, companyName: "Acme" }]);
  });

  test("suppresses opportunities under draft, paused, or closed campaigns", async () => {
    const t = convexTest(schema, modules);
    const draft = await seedOpportunity(t, { subject: "discover_draft_campaign" });
    const paused = await seedOpportunity(t, { subject: "discover_paused_campaign" });
    const closed = await seedOpportunity(t, { subject: "discover_closed_campaign" });
    await t.run(async (ctx) => {
      await ctx.db.patch("campaigns", draft.campaignId, { status: "draft" });
      await ctx.db.patch("campaigns", paused.campaignId, { status: "paused" });
      await ctx.db.patch("campaigns", closed.campaignId, { status: "closed" });
    });

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test("excludes an inactive company", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "discover_inactive" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("companies", owner.membership.companyId, { isActive: false }),
    );

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
  });

  test("excludes a missing company", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "discover_missing_company" });
    await t.run(async (ctx) => await ctx.db.delete("companies", owner.membership.companyId));

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
  });

  test("excludes a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "discover_missing_campaign" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", owner.campaignId));

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
  });

  test("excludes inconsistent campaign ownership", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "discover_owner" });
    const other = await seedCampaign(t, { subject: "discover_other", orgId: "org_other" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", owner.opportunityId, { campaignId: other.campaignId }),
    );

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
  });

  test("paginates public briefs in deadline order", async () => {
    const t = convexTest(schema, modules);
    const later = await seedOpportunity(
      t,
      { subject: "discover_later" },
      { deadline: Date.now() + 172_800_000, productAccessLink: "https://example.com/product" },
    );
    const sooner = await seedOpportunity(t, { subject: "discover_sooner", orgId: "org_other" });

    const firstPage = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 1, cursor: null },
        }),
    );
    const secondPage = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
        }),
    );

    expect(firstPage.page).toMatchObject([
      { _id: sooner.opportunityId, companyName: "Acme", title: "Moisturizer launch video" },
    ]);
    expect(firstPage.page[0]).not.toHaveProperty("companyId");
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toMatchObject([
      { _id: later.opportunityId, companyName: "Acme", title: "Moisturizer launch video" },
    ]);
    expect(secondPage.page[0]).not.toHaveProperty("productAccessLink");
    expect(secondPage.isDone).toBe(true);
  });

  test("continues past an empty visibility-filtered page", async () => {
    const t = convexTest(schema, modules);
    const hidden = await seedOpportunity(t, { subject: "discover_hidden" });
    await t.run(
      async (ctx) => await ctx.db.patch("campaigns", hidden.campaignId, { status: "paused" }),
    );
    const visible = await seedOpportunity(
      t,
      { subject: "discover_visible" },
      { deadline: Date.now() + 172_800_000 },
    );

    const firstPage = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 1, cursor: null },
        }),
    );
    const secondPage = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
        }),
    );

    expect(firstPage.page).toEqual([]);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toMatchObject([{ _id: visible.opportunityId, companyName: "Acme" }]);
    expect(secondPage.isDone).toBe(true);
  });

  test("returns open briefs across companies, including gated and filled opportunities", async () => {
    const t = convexTest(schema, modules);
    const first = await seedOpportunity(t, { subject: "discover_first" });
    const second = await seedOpportunity(
      t,
      { subject: "discover_second", orgId: "org_other" },
      { isGated: true },
    );
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", second.opportunityId, { numFilledSlots: 5 }),
    );

    const result = await t.run(
      async (ctx) =>
        await discoverOpportunities(ctx, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page.map((row) => row._id).sort()).toEqual(
      [first.opportunityId, second.opportunityId].sort(),
    );
    expect(result.isDone).toBe(true);
  });
});

describe("listOpportunities", () => {
  test("lists every state across the company's campaigns without leaking another company", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    const second = await seedOpportunity(t, { subject: "list_member" }, { status: "draft" });
    const paused = await seedOpportunity(t, { subject: "list_paused" });
    const closed = await seedOpportunity(t, { subject: "list_closed" });
    await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", paused.opportunityId, { status: "paused" });
      await ctx.db.patch("opportunities", closed.opportunityId, { status: "closed" });
      await ctx.db.patch("campaigns", owner.campaignId, { status: "paused" });
    });

    const result = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page.map((row) => row._id).sort()).toEqual(
      [
        owner.opportunityId,
        second.opportunityId,
        paused.opportunityId,
        closed.opportunityId,
      ].sort(),
    );
    expect(result.isDone).toBe(true);
  });

  test("filters status across the company's campaigns", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    await seedOpportunity(t, { subject: "list_draft" }, { status: "draft" });
    await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    const result = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          status: "open",
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
    expect(result.isDone).toBe(true);
  });

  test("filters an owned campaign without restricting its opportunity states", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    const draftId = await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          owner.membership,
          opportunityArgs(owner.campaignId, { status: "draft" }),
        ),
    );
    await seedOpportunity(t, { subject: "list_other_campaign" });

    const result = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          campaignId: owner.campaignId,
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page.map((row) => row._id).sort()).toEqual([owner.opportunityId, draftId].sort());
    expect(result.isDone).toBe(true);
  });

  test("combines campaign and status filters", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          owner.membership,
          opportunityArgs(owner.campaignId, { status: "draft" }),
        ),
    );
    await seedOpportunity(t, { subject: "list_other_campaign" });

    const result = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          campaignId: owner.campaignId,
          status: "open",
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
  });

  test("continues company pagination and returns complete stored documents", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    vi.advanceTimersByTime(1);
    const second = await seedOpportunity(
      t,
      { subject: "list_second" },
      {
        title: "Evening routine video",
        productAccessLink: "https://example.com/product",
      },
    );
    const firstPage = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          paginationOpts: { numItems: 1, cursor: null },
        }),
    );
    expect(firstPage.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
        }),
    );
    expect(secondPage.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", second.opportunityId)),
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  test("continues a status-filtered campaign cursor", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    vi.advanceTimersByTime(1);
    const secondId = await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          owner.membership,
          opportunityArgs(owner.campaignId, { title: "Second video" }),
        ),
    );
    await t.run(
      async (ctx) =>
        await createOpportunity(
          ctx,
          owner.membership,
          opportunityArgs(owner.campaignId, { status: "draft" }),
        ),
    );
    const filters = { campaignId: owner.campaignId, status: "open" as const };
    const firstPage = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          ...filters,
          paginationOpts: { numItems: 1, cursor: null },
        }),
    );
    expect(firstPage.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, owner.membership.companyId, {
          ...filters,
          paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
        }),
    );
    expect(secondPage.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", secondId)),
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  test("conceals a foreign campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "list_owner" });
    const other = await seedCampaign(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listOpportunities(ctx, owner.membership.companyId, {
              campaignId: other.campaignId,
              paginationOpts: { numItems: 10, cursor: null },
            }),
        ),
      "not_found",
    );
  });

  test("conceals a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "list_owner" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", owner.campaignId));

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listOpportunities(ctx, owner.membership.companyId, {
              campaignId: owner.campaignId,
              paginationOpts: { numItems: 10, cursor: null },
            }),
        ),
      "not_found",
    );
  });

  test("returns an empty page when the company has no opportunities", async () => {
    const t = convexTest(schema, modules);
    const { membership } = await seedCampaign(t, { subject: "list_owner" });

    const result = await t.run(
      async (ctx) =>
        await listOpportunities(ctx, membership.companyId, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    );

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });
});

describe("createOpportunity", () => {
  test("accepts zero compensation and trims the brief", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, {
      title: "  Launch video  ",
      description: "  Show your routine.  ",
      fixedFeeCents: 0,
      cpmRateCents: 0,
      paymentCapCents: 0,
      maxSlots: 1,
      maxApplications: 1,
    });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject({
      ...args,
      title: "Launch video",
      description: "Show your routine.",
    });
  });

  test("saves a draft with an elapsed deadline", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "draft",
    });
    const args = opportunityArgs(campaignId, { status: "draft", deadline: Date.now() - 1 });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject(args);
  });
  test("stores the brief with campaign ownership and zero filled slots", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId);

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", id));

    expect(stored).toMatchObject({
      ...args,
      companyId: membership.companyId,
      createdBy: membership._id,
      numFilledSlots: 0,
    });
  });

  test("rejects a campaign owned by a different company without writing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "op_owner" });
    const other = await seedCampaign(t, { subject: "op_other", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(ctx, owner.membership, opportunityArgs(other.campaignId)),
        ),
      "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("treats a missing campaign like an inaccessible campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", campaignId));

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "not_found",
    );
  });

  test("allows a draft beneath a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "paused",
    });
    const args = opportunityArgs(campaignId, {
      status: "draft",
      productAccessLink: "https://example.com/product",
    });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject(args);
  });

  test("rejects publishing beneath a draft campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "draft",
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "invalid_state",
    );
  });

  test("rejects publishing beneath a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "paused",
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "invalid_state",
    );
  });

  test("rejects creating beneath a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "closed",
    });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(
              ctx,
              membership,
              opportunityArgs(campaignId, { status: "draft" }),
            ),
        ),
      "invalid_state",
    );
  });

  test("rejects a blank title without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { title: "   " });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a blank description without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { description: "\n  " });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects negative compensation without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { fixedFeeCents: -1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects fractional CPM cents without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { cpmRateCents: 0.5 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects unsafe payment cap cents without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { paymentCapCents: Number.MAX_SAFE_INTEGER + 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects nonfinite compensation without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { fixedFeeCents: Number.NaN });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects zero slots without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxSlots: 0 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects fractional slots without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxSlots: 1.5 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects zero application capacity without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxApplications: 0 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects more applications than available slots without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxSlots: 2, maxApplications: 3 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects unsafe application capacity without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxApplications: Number.MAX_SAFE_INTEGER + 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects an infinite deadline without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { deadline: Number.POSITIVE_INFINITY });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a fractional deadline without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { deadline: Date.now() + 86_400_000 + 0.5 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a deadline after the campaign ends without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    await t.run(
      async (ctx) =>
        await ctx.db.patch("campaigns", campaignId, { endsAt: Date.now() + 86_400_000 - 1 }),
    );
    const args = opportunityArgs(campaignId);

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("allows a deadline equal to the campaign end", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId);
    await t.run(
      async (ctx) => await ctx.db.patch("campaigns", campaignId, { endsAt: args.deadline }),
    );

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject(args);
  });

  test("rejects publishing with an elapsed deadline without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { deadline: Date.now() - 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });
});

describe("requireOpportunity", () => {
  test("hides an opportunity whose companyId disagrees with its campaign", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const other = await seedCampaign(t, { subject: "op_other", orgId: "org_other" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("opportunities", opportunityId, {
          companyId: other.membership.companyId,
        }),
    );

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides drafts from creators", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", opportunityId, { status: "draft" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides paused opportunities from creators", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", opportunityId, { status: "paused" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides closed opportunities from creators", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", opportunityId, { status: "closed" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides opportunities beneath a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("campaigns", campaignId, { status: "paused" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides opportunities beneath a draft campaign", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("campaigns", campaignId, { status: "draft" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides opportunities beneath a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("campaigns", campaignId, { status: "closed" });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides opportunities from an inactive company", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, membership } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.patch("companies", membership.companyId, { isActive: false });
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("hides an opportunity with a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, campaignId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.delete("campaigns", campaignId);
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("returns not_found for a deleted opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);
    await t.run(async (ctx) => {
      await ctx.db.delete("opportunities", opportunityId);
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null })),
      "not_found",
    );
  });

  test("returns the complete open document to a creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });
    const { user } = await asCreator.run(authedContext);

    const result = await t.run(
      async (ctx) => await requireOpportunity(ctx, opportunityId, { user, orgId: null }),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", opportunityId));

    expect(result).toEqual(stored);
  });
});
