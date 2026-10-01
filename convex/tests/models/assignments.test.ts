/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  claimAssignment,
  createAssignmentFromOffer,
  listAssignments,
  listCreatorAssignments,
  requireAssignment,
} from "../../models/assignments";
import { createOpportunity } from "../../models/opportunities";
import schema from "../../schema";
import {
  expectApiError,
  opportunityArgs,
  seedAssignment,
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
        campaignId: owner.campaignId,
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
          campaignId: owner.campaignId,
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

const firstPage = { numItems: 10, cursor: null };

/** Moves the clock forward so each seeded row gets a later creation time. */
function tick() {
  vi.setSystemTime(Date.now() + 1000);
}

type Owner = Awaited<ReturnType<typeof seedOpportunity>>;

/** Adds another opportunity to the owner's campaign. */
async function addOpportunity(t: TestConvex, owner: Owner): Promise<Id<"opportunities">> {
  return await t.run(
    async (ctx) =>
      await createOpportunity(ctx, owner.membership, opportunityArgs(owner.campaignId)),
  );
}

/** Seeds an assignment on the owner's opportunity (or another of its opportunities). */
async function assign(
  t: TestConvex,
  owner: Owner,
  creatorId: Id<"creators">,
  status: Doc<"assignments">["status"] = "termsPending",
  opportunityId: Id<"opportunities"> = owner.opportunityId,
) {
  tick();
  return await seedAssignment(t, {
    opportunityId,
    creatorId,
    status,
  });
}

const ids = (page: Doc<"assignments">[]) => page.map((assignment) => assignment._id);

describe("listAssignments", () => {
  test("lists only the company's assignments, grouped by status and newest first", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });
    const creatorId = await seedCreatorId(t, "creator");
    const olderPending = await assign(t, owner, creatorId, "termsPending");
    const active = await assign(t, owner, creatorId, "active");
    const newerPending = await assign(t, owner, creatorId, "termsPending");
    await assign(t, other, creatorId, "active");

    const result = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, { paginationOpts: firstPage }),
    );

    expect(ids(result.page)).toEqual([newerPending, olderPending, active]);
    expect(result.isDone).toBe(true);
  });

  test("filters by status", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    await assign(t, owner, creatorId, "termsPending");
    const active = await assign(t, owner, creatorId, "active");

    const result = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, {
          status: "active",
          paginationOpts: firstPage,
        }),
    );

    expect(ids(result.page)).toEqual([active]);
  });

  test("filters by opportunity and status", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const otherOpportunityId = await addOpportunity(t, owner);
    const creatorId = await seedCreatorId(t, "creator");
    const wanted = await assign(t, owner, creatorId, "active");
    await assign(t, owner, creatorId, "termsPending");
    await assign(t, owner, creatorId, "active", otherOpportunityId);

    const result = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, {
          opportunityId: owner.opportunityId,
          status: "active",
          paginationOpts: firstPage,
        }),
    );

    expect(ids(result.page)).toEqual([wanted]);
  });

  test("conceals another company's opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listAssignments(ctx, owner.membership.companyId, {
              opportunityId: other.opportunityId,
              paginationOpts: firstPage,
            }),
        ),
      "not_found",
    );
  });

  test("refuses an opportunity outside the requested campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const second = await seedOpportunity(t, { subject: "owner" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listAssignments(ctx, owner.membership.companyId, {
              campaignId: owner.campaignId,
              opportunityId: second.opportunityId,
              paginationOpts: firstPage,
            }),
        ),
      "not_found",
    );
  });

  test("lists every assignment across a campaign's opportunities and excludes other campaigns", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const secondOpportunityId = await addOpportunity(t, owner);
    const otherCampaign = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const first = await assign(t, owner, creatorId, "active");
    await assign(t, otherCampaign, creatorId, "active");
    const second = await assign(t, owner, creatorId, "active", secondOpportunityId);
    const pending = await assign(t, owner, creatorId, "termsPending", secondOpportunityId);

    const all = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, {
          campaignId: owner.campaignId,
          paginationOpts: firstPage,
        }),
    );
    const active = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, {
          campaignId: owner.campaignId,
          status: "active",
          paginationOpts: firstPage,
        }),
    );

    expect(ids(all.page)).toEqual([pending, second, first]);
    expect(ids(active.page)).toEqual([second, first]);
  });

  test("pages through a campaign without skipping or repeating assignments", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const opportunities = [
      owner.opportunityId,
      await addOpportunity(t, owner),
      await addOpportunity(t, owner),
    ];
    const creatorId = await seedCreatorId(t, "creator");
    const seeded = [];
    for (let i = 0; i < 7; i++) {
      seeded.push(await assign(t, owner, creatorId, "active", opportunities[i % 3]));
    }

    const seen: Id<"assignments">[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 10; pages++) {
      const result = await t.run(
        async (ctx) =>
          await listAssignments(ctx, owner.membership.companyId, {
            campaignId: owner.campaignId,
            paginationOpts: { numItems: 3, cursor },
          }),
      );
      seen.push(...ids(result.page));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    expect(seen).toEqual(seeded.reverse());
  });

  test("returns an empty page for a campaign with no opportunities", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    await t.run(async (ctx) => await ctx.db.delete("opportunities", owner.opportunityId));

    const result = await t.run(
      async (ctx) =>
        await listAssignments(ctx, owner.membership.companyId, {
          campaignId: owner.campaignId,
          paginationOpts: firstPage,
        }),
    );

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test("conceals another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listAssignments(ctx, owner.membership.companyId, {
              campaignId: other.campaignId,
              paginationOpts: firstPage,
            }),
        ),
      "not_found",
    );
  });
});

describe("listCreatorAssignments", () => {
  test("splits the creator's assignments into current and past, newest first", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    const active = await assign(t, owner, creatorId, "active");
    const completed = await assign(t, owner, creatorId, "completed");
    const pending = await assign(t, owner, creatorId, "termsPending");
    const cancelled = await assign(t, owner, creatorId, "cancelled");
    await assign(t, owner, otherCreatorId, "active");
    await assign(t, owner, otherCreatorId, "completed");

    const list = async (phase: "current" | "past") =>
      await t.run(
        async (ctx) =>
          await listCreatorAssignments(ctx, creatorId, { phase, paginationOpts: firstPage }),
      );

    expect(ids((await list("current")).page)).toEqual([pending, active]);
    expect(ids((await list("past")).page)).toEqual([cancelled, completed]);
  });

  test("pages through current assignments across both statuses", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const seeded = [];
    for (let i = 0; i < 5; i++) {
      seeded.push(await assign(t, owner, creatorId, i % 2 === 0 ? "termsPending" : "active"));
    }

    const first = await t.run(
      async (ctx) =>
        await listCreatorAssignments(ctx, creatorId, {
          phase: "current",
          paginationOpts: { numItems: 3, cursor: null },
        }),
    );
    const second = await t.run(
      async (ctx) =>
        await listCreatorAssignments(ctx, creatorId, {
          phase: "current",
          paginationOpts: { numItems: 3, cursor: first.continueCursor },
        }),
    );

    expect([...ids(first.page), ...ids(second.page)]).toEqual(seeded.reverse());
    expect(second.isDone).toBe(true);
  });
});

describe("requireAssignment", () => {
  async function seedOne(t: TestConvex) {
    const owner = await seedOpportunity(t, { subject: "owner" });
    const creatorId = await seedCreatorId(t, "creator");
    const assignmentId = await assign(t, owner, creatorId);
    return { owner, creatorId, assignmentId };
  }

  test("returns the assignment to its creator, its company, and operators", async () => {
    const t = convexTest(schema, modules);
    const { owner, creatorId, assignmentId } = await seedOne(t);

    for (const viewer of [
      { role: "creator" as const, creatorId },
      { role: "company" as const, companyId: owner.membership.companyId },
      { role: "operator" as const },
    ]) {
      const assignment = await t.run(
        async (ctx) => await requireAssignment(ctx, viewer, assignmentId),
      );
      expect(assignment._id).toBe(assignmentId);
    }
  });

  test("conceals the assignment from other creators and companies", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedOne(t);
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });

    for (const viewer of [
      { role: "creator" as const, creatorId: otherCreatorId },
      { role: "company" as const, companyId: other.membership.companyId },
    ]) {
      await expectApiError(
        () => t.run(async (ctx) => await requireAssignment(ctx, viewer, assignmentId)),
        "not_found",
      );
    }
  });

  test("reports a missing assignment as not found", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedOne(t);
    await t.run(async (ctx) => await ctx.db.delete("assignments", assignmentId));

    await expectApiError(
      () => t.run(async (ctx) => await requireAssignment(ctx, { role: "operator" }, assignmentId)),
      "not_found",
    );
  });
});
