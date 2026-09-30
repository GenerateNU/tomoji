/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { claimAssignment, createAssignmentFromOffer } from "../../models/assignments";
import schema from "../../schema";
import {
  expectApiError,
  seedCampaign,
  seedCreatorId,
  seedOpportunity,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

/** Reads the opportunity and its assignments so rejections can assert nothing was written. */
async function readSlots(t: TestConvex, opportunityId: Id<"opportunities">) {
  return await t.run(async (ctx) => ({
    opportunity: await ctx.db.get("opportunities", opportunityId),
    assignments: await ctx.db
      .query("assignments")
      .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
      .take(10),
  }));
}

/**
 * Seeds an opportunity, then moves it or its campaign into a status that
 * `createOpportunity` will not create directly.
 */
async function seedOpportunityIn(
  t: TestConvex,
  state: {
    opportunity?: Doc<"opportunities">["status"];
    campaign?: Doc<"campaigns">["status"];
  },
  overrides: { isGated?: boolean } = {},
) {
  const owner = await seedOpportunity(t, { subject: "owner" }, overrides);
  await t.run(async (ctx) => {
    if (state.opportunity !== undefined) {
      await ctx.db.patch("opportunities", owner.opportunityId, { status: state.opportunity });
    }
    if (state.campaign !== undefined) {
      await ctx.db.patch("campaigns", owner.campaignId, { status: state.campaign });
    }
  });
  return owner;
}

describe("claimAssignment", () => {
  test("creates a termsPending assignment with snapshotted terms and takes a slot", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "owner" },
      { fixedFeeCents: 12_000, cpmRateCents: 650, paymentCapCents: 30_000 },
    );
    const creatorId = await seedCreatorId(t, "creator");

    const assignmentId = await t.run(
      async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId),
    );

    const { opportunity, assignments } = await readSlots(t, owner.opportunityId);
    expect(assignments).toEqual([
      {
        _id: assignmentId,
        _creationTime: expect.any(Number),
        opportunityId: owner.opportunityId,
        creatorId,
        companyId: owner.membership.companyId,
        fixedFeeCents: 12_000,
        cpmRateCents: 650,
        paymentCapCents: 30_000,
        usesAiReview: true,
        status: "termsPending",
      },
    ]);
    expect(opportunity?.numFilledSlots).toBe(1);
  });

  test("keeps agreed terms when the opportunity's defaults change later", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const assignmentId = await t.run(
      async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId),
    );
    const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", owner.opportunityId, {
        fixedFeeCents: 1,
        cpmRateCents: 1,
        paymentCapCents: 1,
        usesAiReviewDefault: false,
      });
    });

    expect(await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId))).toEqual(
      before,
    );
  });

  test("gives out slots first come first serve and refuses once full", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "owner" },
      { maxSlots: 2, maxApplications: 2 },
    );
    for (const subject of ["first", "second"]) {
      const creatorId = await seedCreatorId(t, subject);
      await t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId));
    }
    const late = await seedCreatorId(t, "late");
    const before = await readSlots(t, owner.opportunityId);

    await expect(
      t.run(async (ctx) => await claimAssignment(ctx, late, owner.opportunityId)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "opportunity_full" } });
    expect(before.opportunity?.numFilledSlots).toBe(2);
    expect(await readSlots(t, owner.opportunityId)).toEqual(before);
  });

  test.each(["termsPending", "active", "completed", "cancelled"] as const)(
    "refuses a second assignment on the same opportunity when the first is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOpportunity(t, { subject: "owner" });
      const creatorId = await seedCreatorId(t, "creator");
      const assignmentId = await t.run(
        async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId),
      );
      await t.run(async (ctx) => await ctx.db.patch("assignments", assignmentId, { status }));
      const before = await readSlots(t, owner.opportunityId);

      await expectApiError(
        () => t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
        "conflict",
      );
      expect(await readSlots(t, owner.opportunityId)).toEqual(before);
    },
  );

  test.each(["draft", "paused", "closed"] as const)(
    "refuses a %s opportunity without taking a slot",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOpportunityIn(t, { opportunity: status });
      const creatorId = await seedCreatorId(t, "creator");
      const before = await readSlots(t, owner.opportunityId);

      await expect(
        t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "opportunity_not_open" },
      });
      expect(await readSlots(t, owner.opportunityId)).toEqual(before);
    },
  );

  test.each(["draft", "paused", "closed"] as const)(
    "refuses an open opportunity whose campaign is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOpportunityIn(t, { campaign: status });
      const creatorId = await seedCreatorId(t, "creator");
      const before = await readSlots(t, owner.opportunityId);

      await expect(
        t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "campaign_not_open" },
      });
      expect(await readSlots(t, owner.opportunityId)).toEqual(before);
    },
  );

  test("refuses an open opportunity whose deadline passed before the cron closed it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await t.run(async (ctx) => {
      await ctx.db.patch("opportunities", owner.opportunityId, { deadline: Date.now() });
    });

    await expect(
      t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "opportunity_expired" },
    });
  });

  test("refuses a gated opportunity, which goes through applications", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" }, { isGated: true });
    const creatorId = await seedCreatorId(t, "creator");
    const before = await readSlots(t, owner.opportunityId);

    await expect(
      t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "opportunity_gated" },
    });
    expect(await readSlots(t, owner.opportunityId)).toEqual(before);
  });

  test("conceals a missing opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await t.run(async (ctx) => await ctx.db.delete("opportunities", owner.opportunityId));

    await expectApiError(
      () => t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
      "not_found",
    );
  });

  test("conceals an opportunity whose company is inactive", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await t.run(async (ctx) => {
      await ctx.db.patch("companies", owner.membership.companyId, { isActive: false });
    });

    await expectApiError(
      () => t.run(async (ctx) => await claimAssignment(ctx, creatorId, owner.opportunityId)),
      "not_found",
    );
  });
});

describe("createAssignmentFromOffer", () => {
  test.each(["open", "paused"] as const)(
    "creates a termsPending assignment on a gated %s opportunity",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOpportunityIn(t, { opportunity: status }, { isGated: true });
      const creatorId = await seedCreatorId(t, "creator");

      const assignmentId = await t.run(
        async (ctx) =>
          await createAssignmentFromOffer(ctx, {
            opportunityId: owner.opportunityId,
            creatorId,
          }),
      );

      const { opportunity, assignments } = await readSlots(t, owner.opportunityId);
      expect(assignments).toMatchObject([
        {
          _id: assignmentId,
          creatorId,
          companyId: owner.membership.companyId,
          fixedFeeCents: 10_000,
          cpmRateCents: 500,
          paymentCapCents: 25_000,
          usesAiReview: true,
          status: "termsPending",
        },
      ]);
      expect(opportunity?.numFilledSlots).toBe(1);
    },
  );

  test("accepts an offer while the campaign is paused", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunityIn(t, { campaign: "paused" }, { isGated: true });
    const creatorId = await seedCreatorId(t, "creator");

    await t.run(
      async (ctx) =>
        await createAssignmentFromOffer(ctx, { opportunityId: owner.opportunityId, creatorId }),
    );

    expect((await readSlots(t, owner.opportunityId)).assignments).toHaveLength(1);
  });

  test.each(["draft", "closed"] as const)("refuses a %s opportunity", async (status) => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunityIn(t, { opportunity: status }, { isGated: true });
    const creatorId = await seedCreatorId(t, "creator");
    const before = await readSlots(t, owner.opportunityId);

    await expect(
      t.run(
        async (ctx) =>
          await createAssignmentFromOffer(ctx, { opportunityId: owner.opportunityId, creatorId }),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "opportunity_closed" } });
    expect(await readSlots(t, owner.opportunityId)).toEqual(before);
  });

  test("refuses an ungated opportunity, which creators claim directly", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");

    await expect(
      t.run(
        async (ctx) =>
          await createAssignmentFromOffer(ctx, { opportunityId: owner.opportunityId, creatorId }),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "opportunity_not_gated" } });
  });

  test("shares the slot limit with claims", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "owner" },
      { isGated: true, maxSlots: 1, maxApplications: 1 },
    );
    const first = await seedCreatorId(t, "first");
    const second = await seedCreatorId(t, "second");
    await t.run(
      async (ctx) =>
        await createAssignmentFromOffer(ctx, {
          opportunityId: owner.opportunityId,
          creatorId: first,
        }),
    );

    await expect(
      t.run(
        async (ctx) =>
          await createAssignmentFromOffer(ctx, {
            opportunityId: owner.opportunityId,
            creatorId: second,
          }),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "opportunity_full" } });
  });

  test("takes the company from the opportunity's campaign", async () => {
    const t = convexTest(schema, modules);
    await seedCampaign(t, { subject: "other_owner", orgId: "org_other" });
    const owner = await seedOpportunity(t, { subject: "owner" }, { isGated: true });
    const creatorId = await seedCreatorId(t, "creator");

    const assignmentId = await t.run(
      async (ctx) =>
        await createAssignmentFromOffer(ctx, { opportunityId: owner.opportunityId, creatorId }),
    );

    const assignment = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
    expect(assignment?.companyId).toBe(owner.membership.companyId);
  });
});
