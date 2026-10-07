/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  acceptApplication,
  createApplication,
  declineApplication,
  expireApplicationOffers,
  DEFAULT_OFFER_DURATION_MS,
  listApplications,
  listApplicationsByOpportunityId,
  offerApplication,
  rejectApplication,
  requireApplication,
} from "../../models/applications";
import schema from "../../schema";
import {
  creatorNotifications,
  expectApiError,
  memberNotifications,
  seedCreatorId,
  seedGatedOpportunity,
  seedMembership,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const DAY = 24 * 60 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;

/** The first :00 or :30 UTC boundary at or after `time`. */
const nextHalfHour = (time: number) => Math.ceil(time / HALF_HOUR) * HALF_HOUR;

type SeededIds = { opportunityId: Id<"opportunities"> };

/** Opportunity states where only creators may act, so company review actions are refused. */
const pausedOrClosed: {
  name: string;
  patch: (ctx: MutationCtx, ids: SeededIds) => Promise<void>;
  reason: string;
}[] = [
  {
    name: "the opportunity is paused",
    patch: (ctx, ids) => ctx.db.patch("opportunities", ids.opportunityId, { status: "paused" }),
    reason: "opportunity_not_open",
  },
  {
    name: "the opportunity is closed",
    patch: (ctx, ids) => ctx.db.patch("opportunities", ids.opportunityId, { status: "closed" }),
    reason: "opportunity_not_open",
  },
];

/** Asserts a call fails with a specific API error reason. */
async function expectReason(call: () => Promise<unknown>, reason: string) {
  await expect(call()).rejects.toThrow(new RegExp(`"reason":"${reason}"`));
}

async function applyAs(
  t: TestConvex,
  creatorId: Awaited<ReturnType<typeof seedCreatorId>>,
  opportunityId: Awaited<ReturnType<typeof seedGatedOpportunity>>["opportunityId"],
  note = "I film daily.",
) {
  return await t.run(
    async (ctx) => await createApplication(ctx, creatorId, { opportunityId, note }),
  );
}

describe("createApplication", () => {
  test("stores a pending application with the trimmed note and company", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");

    const id = await t.run(
      async (ctx) =>
        await createApplication(ctx, creatorId, { opportunityId, note: "  I film daily.  " }),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", id));

    expect(stored).toMatchObject({
      opportunityId,
      creatorId,
      companyId,
      note: "I film daily.",
      status: "pending",
    });
    expect(stored?.statusLastUpdatedAt).toBeUndefined();
  });

  test("rejects an opportunity that does not exist", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    await t.run(async (ctx) => await ctx.db.delete("opportunities", opportunityId));

    await expectApiError(() => applyAs(t, creatorId, opportunityId), "not_found");
  });

  test.each<{
    name: string;
    opportunity?: Partial<WithoutSystemFields<Doc<"opportunities">>>;
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
  ])("rejects $name", async ({ opportunity, reason }) => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t, { opportunity });
    const creatorId = await seedCreatorId(t, "creator_a");

    await expectReason(() => applyAs(t, creatorId, opportunityId), reason);
  });

  test.each([
    { name: "no note", note: undefined },
    { name: "a blank note", note: "   " },
  ])("leaves the note out when given $name", async ({ note }) => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");

    const id = await t.run(
      async (ctx) => await createApplication(ctx, creatorId, { opportunityId, note }),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", id));

    expect(stored).not.toHaveProperty("note");
  });

  test("rejects a second application from the same creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    await applyAs(t, creatorId, opportunityId);

    await expectApiError(() => applyAs(t, creatorId, opportunityId), "conflict");
  });

  test("allows the same creator to apply to a different opportunity", async () => {
    const t = convexTest(schema, modules);
    const first = await seedGatedOpportunity(t);
    const second = await seedGatedOpportunity(t, { subject: "company_other", orgId: "org_other" });
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
    const { opportunityId } = await seedGatedOpportunity(t);
    await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);
    const otherCreatorId = await seedCreatorId(t, "creator_b");

    const applicationId = await applyAs(t, otherCreatorId, opportunityId);

    const stored = await t.run(async (ctx) => await ctx.db.get("applications", applicationId));
    expect(stored).toMatchObject({ opportunityId, creatorId: otherCreatorId });
  });

  test("rejects applications once maxApplications is reached, counting every status", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t, {
      opportunity: { maxApplications: 2 },
    });
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
    const seeded = await seedGatedOpportunity(t);
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
    const other = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

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
    const first = await seedGatedOpportunity(t);
    const second = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
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
    const first = await seedGatedOpportunity(t);
    const second = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
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
    const first = await seedGatedOpportunity(t);
    const second = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
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

describe("listApplicationsByOpportunityId", () => {
  const firstPage = { numItems: 10, cursor: null };

  test("returns applications to one of the company's opportunities, filtered by status", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId } = await seedGatedOpportunity(t);
    const pendingId = await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);
    const rejectedId = await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);
    await t.run(
      async (ctx) => await ctx.db.patch("applications", rejectedId, { status: "rejected" }),
    );

    const all = await t.run(
      async (ctx) =>
        await listApplicationsByOpportunityId(ctx, companyId, {
          opportunityId,
          paginationOpts: firstPage,
        }),
    );
    const pending = await t.run(
      async (ctx) =>
        await listApplicationsByOpportunityId(ctx, companyId, {
          opportunityId,
          status: "pending",
          paginationOpts: firstPage,
        }),
    );

    expect(all.page.map((application) => application._id).sort()).toEqual(
      [pendingId, rejectedId].sort(),
    );
    expect(pending.page.map((application) => application._id)).toEqual([pendingId]);
  });

  test("hides another company's opportunity as not found", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const other = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listApplicationsByOpportunityId(ctx, other.companyId, {
              opportunityId,
              paginationOpts: firstPage,
            }),
        ),
      "not_found",
    );
  });
});

describe("offerApplication", () => {
  async function seedPending(t: TestConvex, opts: Parameters<typeof seedGatedOpportunity>[1] = {}) {
    const seeded = await seedGatedOpportunity(t, opts);
    const applicationId = await applyAs(
      t,
      await seedCreatorId(t, "creator_a"),
      seeded.opportunityId,
    );
    return { ...seeded, applicationId };
  }

  test("offers a pending application with the default expiry", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    const before = Date.now();

    const offered = await t.run(
      async (ctx) => await offerApplication(ctx, companyId, applicationId),
    );

    expect(offered.status).toBe("offered");
    expect(offered.statusLastUpdatedAt).toBeGreaterThanOrEqual(before);
    // Rounded up to :00/:30 so the expiry cron marks it exactly on time.
    expect(offered.offerExpiresAt).toBe(
      nextHalfHour(offered.statusLastUpdatedAt! + DEFAULT_OFFER_DURATION_MS),
    );
  });

  test("uses a company-chosen expiry on :00 or :30", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    const offerExpiresAt = nextHalfHour(Date.now() + 3 * DAY);

    const offered = await t.run(
      async (ctx) => await offerApplication(ctx, companyId, applicationId, offerExpiresAt),
    );

    expect(offered.offerExpiresAt).toBe(offerExpiresAt);
  });

  test("does not cap offers by open slots", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId } = await seedGatedOpportunity(t, {
      opportunity: { maxSlots: 1 },
    });
    const first = await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);
    const second = await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);

    await t.run(async (ctx) => await offerApplication(ctx, companyId, first));
    const offered = await t.run(async (ctx) => await offerApplication(ctx, companyId, second));

    expect(offered.status).toBe("offered");
  });

  test.each([
    { name: "in the past", expiresAt: () => nextHalfHour(Date.now()) - HALF_HOUR },
    { name: "off :00/:30", expiresAt: () => nextHalfHour(Date.now() + DAY) + 60_000 },
  ])("rejects an expiry $name", async ({ expiresAt }) => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);

    await expectReason(
      () =>
        t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId, expiresAt())),
      "invalid_offer_expiry",
    );
  });

  test("rejects an application that is not pending", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId));

    await expectReason(
      () => t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId)),
      "application_not_pending",
    );
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedPending(t);
    const other = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () => t.run(async (ctx) => await offerApplication(ctx, other.companyId, applicationId)),
      "not_found",
    );
  });

  test.each(pausedOrClosed)("rejects offering while $name", async ({ patch, reason }) => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await patch(ctx, { opportunityId }));

    await expectReason(
      () => t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId)),
      reason,
    );
  });
});

describe("rejectApplication", () => {
  async function seedPending(t: TestConvex) {
    const seeded = await seedGatedOpportunity(t);
    const applicationId = await applyAs(
      t,
      await seedCreatorId(t, "creator_a"),
      seeded.opportunityId,
    );
    return { ...seeded, applicationId };
  }

  test("rejects a pending application", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    const before = Date.now();

    const rejected = await t.run(
      async (ctx) => await rejectApplication(ctx, companyId, applicationId),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", applicationId));

    expect(rejected.status).toBe("rejected");
    expect(stored?.statusLastUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  test("refuses an application that is not pending", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId));

    await expectReason(
      () => t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId)),
      "application_not_pending",
    );
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedPending(t);
    const other = await seedGatedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () => t.run(async (ctx) => await rejectApplication(ctx, other.companyId, applicationId)),
      "not_found",
    );
  });

  test.each(pausedOrClosed)("refuses rejecting while $name", async ({ patch, reason }) => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await patch(ctx, { opportunityId }));

    await expectReason(
      () => t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId)),
      reason,
    );
  });
});

/** Seeds an opportunity and an offered application from `creator_a`. */
async function seedOffered(t: TestConvex, opts: Parameters<typeof seedGatedOpportunity>[1] = {}) {
  const seeded = await seedGatedOpportunity(t, opts);
  const creatorId = await seedCreatorId(t, "creator_a");
  const applicationId = await applyAs(t, creatorId, seeded.opportunityId);
  await t.run(async (ctx) => {
    await offerApplication(ctx, seeded.companyId, applicationId);
    // Backdate the offer so tests can tell whether a later action set the timestamp.
    await ctx.db.patch("applications", applicationId, { statusLastUpdatedAt: 0 });
  });
  return { ...seeded, creatorId, applicationId };
}

describe("acceptApplication", () => {
  test("accepts the offer, takes a slot, and creates the assignment with the opportunity's terms", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, creatorId, applicationId } = await seedOffered(t);
    const before = Date.now();

    const accepted = await t.run(
      async (ctx) => await acceptApplication(ctx, creatorId, applicationId),
    );
    const { opportunity, assignments } = await t.run(async (ctx) => ({
      opportunity: await ctx.db.get("opportunities", opportunityId),
      assignments: await ctx.db
        .query("assignments")
        .withIndex("by_opportunityId_and_creatorId", (q) =>
          q.eq("opportunityId", opportunityId).eq("creatorId", creatorId),
        )
        .take(2),
    }));

    expect(accepted.status).toBe("accepted");
    expect(accepted.offerAcceptedAt).toBeGreaterThanOrEqual(before);
    expect(accepted.statusLastUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(opportunity?.numFilledSlots).toBe(1);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      status: "termsPending",
      fixedFeeCents: opportunity?.fixedFeeCents,
      cpmRateCents: opportunity?.cpmRateCents,
      paymentCapCents: opportunity?.paymentCapCents,
      usesAiReview: opportunity?.usesAiReviewDefault,
    });
  });

  test.each(["open", "paused"] as const)(
    "still accepts while the opportunity is paused and its campaign is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const { campaignId, opportunityId, creatorId, applicationId } = await seedOffered(t);
      await t.run(async (ctx) => {
        await ctx.db.patch("campaigns", campaignId, { status });
        await ctx.db.patch("opportunities", opportunityId, { status: "paused" });
      });

      const accepted = await t.run(
        async (ctx) => await acceptApplication(ctx, creatorId, applicationId),
      );

      expect(accepted.status).toBe("accepted");
    },
  );

  test("refuses once the opportunity is closed", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, creatorId, applicationId } = await seedOffered(t);
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status: "closed" }),
    );

    await expectReason(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "opportunity_closed",
    );
  });

  test("refuses an expired offer even before the cron marks it", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedOffered(t);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", applicationId, { offerExpiresAt: Date.now() - 1 }),
    );

    await expectReason(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "offer_expired",
    );
  });

  test("refuses an application without an offer", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, opportunityId);

    await expectReason(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "application_not_offered",
    );
  });

  test("hides another creator's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedOffered(t);
    const otherCreatorId = await seedCreatorId(t, "creator_b");

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, otherCreatorId, applicationId)),
      "not_found",
    );
  });

  test("refuses when every slot is already filled", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 1 },
    });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunityId, { numFilledSlots: 1 }),
    );

    await expectReason(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "opportunity_full",
    );
  });

  test("taking the last slot marks remaining pending and offered applications as full", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 1 },
    });
    const offeredId = await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, offeredId));
    const pendingId = await applyAs(t, await seedCreatorId(t, "creator_c"), opportunityId);
    const rejectedId = await applyAs(t, await seedCreatorId(t, "creator_d"), opportunityId);
    await t.run(async (ctx) => await rejectApplication(ctx, companyId, rejectedId));

    const beforeAccept = Date.now();
    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));
    const statuses = await t.run(async (ctx) =>
      Promise.all(
        [applicationId, offeredId, pendingId, rejectedId].map(
          async (id) => (await ctx.db.get("applications", id))?.status,
        ),
      ),
    );

    expect(statuses).toEqual(["accepted", "opportunityFull", "opportunityFull", "rejected"]);
    const full = await t.run(async (ctx) => await ctx.db.get("applications", pendingId));
    expect(full?.statusLastUpdatedAt).toBeGreaterThanOrEqual(beforeAccept);
  });

  test("leaves other offers open while slots remain", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 2 },
    });
    const offeredId = await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, offeredId));

    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));
    const other = await t.run(async (ctx) => await ctx.db.get("applications", offeredId));

    expect(other?.status).toBe("offered");
  });
});

describe("declineApplication", () => {
  test("declines an offer", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedOffered(t);
    const before = Date.now();

    const declined = await t.run(
      async (ctx) => await declineApplication(ctx, creatorId, applicationId),
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", applicationId));

    expect(declined.status).toBe("declined");
    expect(stored?.statusLastUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  test.each(["paused", "closed"] as const)(
    "still declines while the opportunity and campaign are %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const { campaignId, opportunityId, creatorId, applicationId } = await seedOffered(t);
      await t.run(async (ctx) => {
        await ctx.db.patch("campaigns", campaignId, { status });
        await ctx.db.patch("opportunities", opportunityId, { status });
      });

      const declined = await t.run(
        async (ctx) => await declineApplication(ctx, creatorId, applicationId),
      );

      expect(declined.status).toBe("declined");
    },
  );

  test("refuses an application without an offer", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, opportunityId);

    await expectReason(
      () => t.run(async (ctx) => await declineApplication(ctx, creatorId, applicationId)),
      "application_not_offered",
    );
  });

  test("hides another creator's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedOffered(t);
    const otherCreatorId = await seedCreatorId(t, "creator_b");

    await expectApiError(
      () => t.run(async (ctx) => await declineApplication(ctx, otherCreatorId, applicationId)),
      "not_found",
    );
  });
});

describe("expireApplicationOffers", () => {
  test("marks offers past their expiry as offerExpired and leaves the rest", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, applicationId: expiredId } = await seedOffered(t);
    const openId = await applyAs(t, await seedCreatorId(t, "creator_b"), opportunityId);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, openId));
    const pendingId = await applyAs(t, await seedCreatorId(t, "creator_c"), opportunityId);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", expiredId, { offerExpiresAt: Date.now() - 1 }),
    );

    const beforeExpire = Date.now();
    const hasMore = await t.run(async (ctx) => await expireApplicationOffers(ctx));
    const statuses = await t.run(async (ctx) =>
      Promise.all(
        [expiredId, openId, pendingId].map(
          async (id) => (await ctx.db.get("applications", id))?.status,
        ),
      ),
    );

    expect(hasMore).toBe(false);
    expect(statuses).toEqual(["offerExpired", "offered", "pending"]);
    const expired = await t.run(async (ctx) => await ctx.db.get("applications", expiredId));
    expect(expired?.statusLastUpdatedAt).toBeGreaterThanOrEqual(beforeExpire);
  });

  test("does not expire an offer that was already accepted", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedOffered(t);
    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", applicationId, { offerExpiresAt: Date.now() - 1 }),
    );

    await t.run(async (ctx) => await expireApplicationOffers(ctx));
    const stored = await t.run(async (ctx) => await ctx.db.get("applications", applicationId));

    expect(stored?.status).toBe("accepted");
  });
});

describe("notifications", () => {
  const title = "Moisturizer launch video";

  test("a new application notifies only the member who created the opportunity", async () => {
    const t = convexTest(schema, modules);
    const { membership, opportunityId } = await seedGatedOpportunity(t);
    const { membership: teammate } = await seedMembership(t, "teammate", "org_acme");

    const applicationId = await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);

    expect(await memberNotifications(t, membership)).toEqual([
      {
        type: "applicationReceived",
        title: `New application for ${title}`,
        target: { kind: "application", applicationId, opportunityId },
      },
    ]);
    expect(await memberNotifications(t, teammate)).toEqual([]);
  });

  test("an offer notifies the creator", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId, opportunityId } = await seedOffered(t);

    expect(await creatorNotifications(t, creatorId)).toEqual([
      {
        type: "applicationOffered",
        title: `You received an offer for ${title}`,
        target: { kind: "application", applicationId, opportunityId },
      },
    ]);
  });

  test("a rejection notifies the creator", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, opportunityId);

    await t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId));

    expect(await creatorNotifications(t, creatorId)).toEqual([
      {
        type: "applicationRejected",
        title: `Your application for ${title} wasn't accepted`,
        target: { kind: "application", applicationId, opportunityId },
      },
    ]);
  });

  test("a refused action sends no notification", async () => {
    const t = convexTest(schema, modules);
    const { companyId, creatorId, applicationId } = await seedOffered(t);

    await expectApiError(
      () => t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId)),
      "invalid_state",
    );

    expect((await creatorNotifications(t, creatorId)).map((n) => n.type)).toEqual([
      "applicationOffered",
    ]);
  });

  test("accepting an offer notifies the opportunity creator with the new assignment", async () => {
    const t = convexTest(schema, modules);
    const { membership, creatorId, applicationId, opportunityId } = await seedOffered(t);

    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));

    const assignment = await t.run(async (ctx) =>
      ctx.db
        .query("assignments")
        .withIndex("by_opportunityId_and_creatorId", (q) =>
          q.eq("opportunityId", opportunityId).eq("creatorId", creatorId),
        )
        .unique(),
    );
    expect((await memberNotifications(t, membership)).at(-1)).toEqual({
      type: "applicationAccepted",
      title: `Your offer for ${title} was accepted`,
      target: { kind: "assignment", assignmentId: assignment?._id },
    });
  });

  test("taking the last slot notifies each creator whose application became full", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 1 },
    });
    const otherCreatorId = await seedCreatorId(t, "creator_b");
    const otherId = await applyAs(t, otherCreatorId, opportunityId);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, otherId));

    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));

    expect((await creatorNotifications(t, otherCreatorId)).at(-1)).toEqual({
      type: "applicationOpportunityFull",
      title: `${title} has filled all its slots`,
      target: { kind: "application", applicationId: otherId, opportunityId },
    });
    expect((await creatorNotifications(t, creatorId)).map((n) => n.type)).toEqual([
      "applicationOffered",
    ]);
  });

  test("declining an offer notifies the opportunity creator", async () => {
    const t = convexTest(schema, modules);
    const { membership, creatorId, applicationId, opportunityId } = await seedOffered(t);

    await t.run(async (ctx) => await declineApplication(ctx, creatorId, applicationId));

    expect((await memberNotifications(t, membership)).at(-1)).toEqual({
      type: "applicationDeclined",
      title: `Your offer for ${title} was declined`,
      target: { kind: "application", applicationId, opportunityId },
    });
  });

  test("an expired offer notifies the creator and the opportunity creator", async () => {
    const t = convexTest(schema, modules);
    const { membership, creatorId, applicationId, opportunityId } = await seedOffered(t);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", applicationId, { offerExpiresAt: Date.now() - 1 }),
    );

    await t.run(async (ctx) => await expireApplicationOffers(ctx));

    const target = { kind: "application", applicationId, opportunityId };
    expect((await creatorNotifications(t, creatorId)).at(-1)).toEqual({
      type: "applicationOfferExpired",
      title: `Your offer for ${title} expired`,
      target,
    });
    expect((await memberNotifications(t, membership)).at(-1)).toEqual({
      type: "applicationOfferExpired",
      title: `An offer for ${title} expired unanswered`,
      target,
    });
  });

  test("a missing opportunity creator does not block the application", async () => {
    const t = convexTest(schema, modules);
    const { membership, opportunityId } = await seedGatedOpportunity(t);
    await t.run(async (ctx) => await ctx.db.delete("companyUsers", membership._id));

    const applicationId = await applyAs(t, await seedCreatorId(t, "creator_a"), opportunityId);

    expect(await t.run(async (ctx) => await ctx.db.get("applications", applicationId))).not.toBe(
      null,
    );
    expect(await memberNotifications(t, membership)).toEqual([]);
  });
});
