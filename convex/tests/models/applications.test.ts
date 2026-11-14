/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  acceptApplication,
  APPLICATION_SWEEP_BATCH,
  createApplication,
  declineApplication,
  expireApplicationOffers,
  DEFAULT_OFFER_DURATION_MS,
  listApplicationRows,
  listApplicationsByOpportunityId,
  markApplicationsFullBatch,
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
        await createApplication(ctx, creatorId, {
          opportunityId,
          note: "  I film daily.  ",
        }),
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

    await expectApiError(() => applyAs(t, creatorId, opportunityId), "invalid_state", reason);
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
    const second = await seedGatedOpportunity(t, {
      subject: "company_other",
      orgId: "org_other",
    });
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

  test("a slot freed between batches stops the rest of the sweep", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId } = await seedGatedOpportunity(t, {
      opportunity: { maxSlots: 1, numFilledSlots: 1 },
    });
    const creatorId = await seedCreatorId(t, "waiting_creator");
    const waiting = APPLICATION_SWEEP_BATCH + 10;
    await t.run(async (ctx) => {
      for (let i = 0; i < waiting; i++) {
        await ctx.db.insert("applications", {
          opportunityId,
          creatorId,
          companyId,
          status: "pending",
        });
      }
    });

    // First batch runs while the opportunity is full, then a decline frees the slot.
    expect(await t.run((ctx) => markApplicationsFullBatch(ctx, opportunityId))).toBe(true);
    await t.run((ctx) => ctx.db.patch("opportunities", opportunityId, { numFilledSlots: 0 }));
    expect(await t.run((ctx) => markApplicationsFullBatch(ctx, opportunityId))).toBe(false);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("applications")
        .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
        .take(waiting + 10),
    );
    expect(rows.filter((a) => a.status === "opportunityFull")).toHaveLength(
      APPLICATION_SWEEP_BATCH,
    );
    expect(rows.filter((a) => a.status === "pending")).toHaveLength(10);
  });

  test("sweeps more waiting applications than one batch holds, across scheduled continuations", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 1 },
    });
    const waiting = APPLICATION_SWEEP_BATCH + 10;
    // Raw rows: the sweep reads by status, not by distinct creator.
    const otherCreatorId = await seedCreatorId(t, "creator_b");
    await t.run(async (ctx) => {
      for (let i = 0; i < waiting; i++) {
        await ctx.db.insert("applications", {
          opportunityId,
          creatorId: otherCreatorId,
          companyId,
          status: i % 2 === 0 ? "pending" : "offered",
        });
      }
    });

    await t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId));
    await t.finishAllScheduledFunctions(() => {});

    const remaining = await t.run((ctx) =>
      ctx.db
        .query("applications")
        .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
        .take(waiting + 10),
    );
    expect(remaining.filter((a) => a.status === "opportunityFull")).toHaveLength(waiting);
    expect(remaining.filter((a) => a.status === "pending" || a.status === "offered")).toEqual([]);
  });

  test("refuses a new application once every slot is filled", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t, {
      opportunity: { maxSlots: 1, numFilledSlots: 1 },
    });
    const creatorId = await seedCreatorId(t, "late_applicant");

    await expectApiError(
      () => applyAs(t, creatorId, opportunityId),
      "invalid_state",
      "opportunity_full",
    );
    expect(await t.run((ctx) => ctx.db.query("applications").take(1))).toEqual([]);
  });

  test("accepts applications past the slot count, since gated briefs are not capped", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t, {
      opportunity: { maxSlots: 1 },
    });

    for (const subject of ["creator_a", "creator_b", "creator_c"]) {
      await applyAs(t, await seedCreatorId(t, subject), opportunityId);
    }

    expect(
      await t.run((ctx) =>
        ctx.db
          .query("applications")
          .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
          .take(10),
      ),
    ).toHaveLength(3);
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

    expect(application).toMatchObject({
      _id: applicationId,
      creatorId,
      status: "pending",
    });
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
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

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
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

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
    {
      name: "in the past",
      expiresAt: () => nextHalfHour(Date.now()) - HALF_HOUR,
    },
    {
      name: "off :00/:30",
      expiresAt: () => nextHalfHour(Date.now() + DAY) + 60_000,
    },
  ])("rejects an expiry $name", async ({ expiresAt }) => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);

    await expectApiError(
      () =>
        t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId, expiresAt())),
      "invalid_state",
      "invalid_offer_expiry",
    );
  });

  test("rejects an application that is not pending", async () => {
    const t = convexTest(schema, modules);
    const { companyId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId));

    await expectApiError(
      () => t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId)),
      "invalid_state",
      "application_not_pending",
    );
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedPending(t);
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => t.run(async (ctx) => await offerApplication(ctx, other.companyId, applicationId)),
      "not_found",
    );
  });

  test.each(pausedOrClosed)("rejects offering while $name", async ({ patch, reason }) => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await patch(ctx, { opportunityId }));

    await expectApiError(
      () => t.run(async (ctx) => await offerApplication(ctx, companyId, applicationId)),
      "invalid_state",
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

    await expectApiError(
      () => t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId)),
      "invalid_state",
      "application_not_pending",
    );
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedPending(t);
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => t.run(async (ctx) => await rejectApplication(ctx, other.companyId, applicationId)),
      "not_found",
    );
  });

  test.each(pausedOrClosed)("refuses rejecting while $name", async ({ patch, reason }) => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, applicationId } = await seedPending(t);
    await t.run(async (ctx) => await patch(ctx, { opportunityId }));

    await expectApiError(
      () => t.run(async (ctx) => await rejectApplication(ctx, companyId, applicationId)),
      "invalid_state",
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
    await ctx.db.patch("applications", applicationId, {
      statusLastUpdatedAt: 0,
    });
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
        await ctx.db.patch("opportunities", opportunityId, {
          status: "paused",
        });
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
      async (ctx) =>
        await ctx.db.patch("opportunities", opportunityId, {
          status: "closed",
        }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
      "opportunity_closed",
    );
  });

  test("refuses an expired offer even before the cron marks it", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedOffered(t);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", applicationId, {
          offerExpiresAt: Date.now() - 1,
        }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
      "offer_expired",
    );
  });

  test("refuses an application without an offer", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, opportunityId);

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
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
      async (ctx) =>
        await ctx.db.patch("opportunities", opportunityId, {
          numFilledSlots: 1,
        }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
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
    await t.finishAllScheduledFunctions(() => {});
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

    await expectApiError(
      () => t.run(async (ctx) => await declineApplication(ctx, creatorId, applicationId)),
      "invalid_state",
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
        await ctx.db.patch("applications", expiredId, {
          offerExpiresAt: Date.now() - 1,
        }),
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
        await ctx.db.patch("applications", applicationId, {
          offerExpiresAt: Date.now() - 1,
        }),
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
        title: `Test applied to ${title}`,
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
      title: `Test accepted your offer for ${title}`,
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
    await t.finishAllScheduledFunctions(() => {});

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
      title: `Test declined your offer for ${title}`,
      target: { kind: "application", applicationId, opportunityId },
    });
  });

  test("an expired offer notifies the creator and the opportunity creator", async () => {
    const t = convexTest(schema, modules);
    const { membership, creatorId, applicationId, opportunityId } = await seedOffered(t);
    await t.run(
      async (ctx) =>
        await ctx.db.patch("applications", applicationId, {
          offerExpiresAt: Date.now() - 1,
        }),
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
      title: `Test's offer for ${title} expired unanswered`,
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

describe("listApplicationRows", () => {
  type SearchArgs = Parameters<typeof listApplicationRows>[2];
  type Status = Doc<"applications">["status"];
  type RowSeed = {
    title?: string;
    companyName?: string;
    status?: Status;
    fixedFeeCents?: number;
    cpmRateCents?: number;
    paymentCapCents?: number;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  let sequence = 0;

  /**
   * Seeds an opportunity at its own company and applies to it with a raw
   * insert, a second after the previous row, so `_creationTime` orders rows.
   */
  async function seedRow(t: TestConvex, creatorId: Id<"creators">, seed: RowSeed = {}) {
    sequence += 1;
    const { title, companyName, status, ...terms } = seed;
    const seeded = await seedGatedOpportunity(t, {
      subject: `row_owner_${sequence}`,
      orgId: `org_row_${sequence}`,
      opportunity: { ...(title === undefined ? {} : { title }), ...terms },
    });
    if (companyName !== undefined) {
      await t.run((ctx) => ctx.db.patch("companies", seeded.companyId, { name: companyName }));
    }
    vi.setSystemTime(Date.now() + 1000);
    const applicationId = await t.run((ctx) =>
      ctx.db.insert("applications", {
        opportunityId: seeded.opportunityId,
        creatorId,
        companyId: seeded.companyId,
        status: status ?? "pending",
      }),
    );
    return { ...seeded, applicationId };
  }

  async function listRows(
    t: TestConvex,
    creatorId: Id<"creators">,
    overrides: Partial<SearchArgs> = {},
    options?: { limit: number },
  ) {
    const args: SearchArgs = {
      tab: "applications",
      page: 1,
      pageSize: 10,
      ...overrides,
    };
    return await t.run((ctx) => listApplicationRows(ctx, creatorId, args, options));
  }

  const titles = (result: { rows: { title: string }[] }) => result.rows.map((row) => row.title);

  test("only the applications, rejected and full statuses are rows, with counts for each tab", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    const statuses: Status[] = [
      "pending",
      "rejected",
      "opportunityFull",
      "offered",
      "offerExpired",
      "declined",
      "accepted",
    ];
    for (const status of statuses) await seedRow(t, creatorId, { status, title: status });

    const result = await listRows(t, creatorId, {
      sort: { key: "name", direction: "ascending" },
    });

    expect(titles(result)).toEqual(["opportunityFull", "pending", "rejected"]);
    expect(result.rows.map((row) => row.status).sort()).toEqual([
      "opportunityFull",
      "pending",
      "rejected",
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.counts).toEqual({
      applications: { count: 3, isCapped: false },
      offers: { count: 3, isCapped: false },
      accepted: { count: 1, isCapped: false },
    });
  });

  test("only the calling creator's applications are listed or counted", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    const otherId = await seedCreatorId(t, "creator_b");
    await seedRow(t, creatorId, { title: "Mine" });
    await seedRow(t, otherId, { title: "Theirs" });
    await seedRow(t, otherId, { title: "Theirs offered", status: "offered" });

    const result = await listRows(t, creatorId);

    expect(titles(result)).toEqual(["Mine"]);
    expect(result.counts.applications.count).toBe(1);
    expect(result.counts.offers.count).toBe(0);
  });

  test("a row carries the application, opportunity and company details", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    const { applicationId, opportunityId, companyId } = await seedRow(t, creatorId, {
      title: "Spring serum launch",
      companyName: "Glow Labs",
      fixedFeeCents: 35_000,
      cpmRateCents: 275,
      paymentCapCents: 90_000,
    });
    const logoId = await t.run(async (ctx) => {
      const company = await ctx.db.get("companies", companyId);
      const member = await ctx.db
        .query("companyUsers")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .first();
      if (company === null || member === null) throw new Error("expected seeded company");
      const mediaId = await ctx.db.insert("mediaUploads", {
        ownerUserId: member.userId,
        companyId,
        kind: "company-profile-picture",
        status: "complete",
        contentType: "image/png",
        stagingKey: "staging/company-profile-picture/test",
        permanentKey: "media/company-profile-picture/test",
        sizeBytes: 1024,
        grantExpiresAt: Date.now() + 60_000,
      });
      await ctx.db.patch("companies", companyId, {
        profilePictureMediaId: mediaId,
      });
      return mediaId;
    });
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId));

    const result = await listRows(t, creatorId);

    expect(result.rows).toEqual([
      {
        applicationId,
        opportunityId,
        status: "pending",
        submittedAt: application?._creationTime,
        title: "Spring serum launch",
        companyName: "Glow Labs",
        companyLogoMediaId: logoId,
        fixedFeeCents: 35_000,
        cpmRateCents: 275,
        paymentCapCents: 90_000,
        isStarred: false,
        canStar: true,
      },
    ]);
  });

  test("a company without a logo has no companyLogoMediaId", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    await seedRow(t, creatorId);

    const result = await listRows(t, creatorId);

    expect(result.rows[0]).not.toHaveProperty("companyLogoMediaId");
  });

  test("an application whose opportunity was deleted is skipped", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    await seedRow(t, creatorId, { title: "Kept" });
    const gone = await seedRow(t, creatorId, { title: "Gone" });
    await t.run((ctx) => ctx.db.delete("opportunities", gone.opportunityId));

    const result = await listRows(t, creatorId);

    expect(titles(result)).toEqual(["Kept"]);
    expect(result.totalCount).toBe(1);
  });

  test("an application whose company was deleted shows an empty company name", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "creator_a");
    const { companyId } = await seedRow(t, creatorId, { title: "Orphaned" });
    await t.run((ctx) => ctx.db.delete("companies", companyId));

    const result = await listRows(t, creatorId);

    expect(result.rows).toMatchObject([{ title: "Orphaned", companyName: "", canStar: false }]);
  });

  describe("search", () => {
    test.each([
      { name: "title", search: "serum" },
      { name: "company name", search: "glow" },
      { name: "a differently cased query", search: "SERUM" },
      { name: "a query with surrounding whitespace", search: "  serum  " },
    ])("matches on $name", async ({ search }) => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, {
        title: "Spring Serum launch",
        companyName: "Glow Labs",
      });
      await seedRow(t, creatorId, {
        title: "Sneaker drop",
        companyName: "Stride",
      });

      const result = await listRows(t, creatorId, { search });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].title).toBe("Spring Serum launch");
    });

    test("a query matching nothing returns no rows and a zero total", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId);

      const result = await listRows(t, creatorId, {
        search: "nothing like this",
      });

      expect(result).toMatchObject({ rows: [], totalCount: 0, page: 1 });
      expect(result.counts.applications.count).toBe(1);
    });

    test("a blank query applies no filter", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId);

      const result = await listRows(t, creatorId, { search: "   " });

      expect(result.totalCount).toBe(1);
    });

    test("a query of exactly 100 characters is accepted", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      const result = await listRows(t, creatorId, { search: "a".repeat(100) });

      expect(result.totalCount).toBe(0);
    });

    test("a query over 100 characters is refused", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      await expectApiError(
        () => listRows(t, creatorId, { search: "a".repeat(101) }),
        "invalid_state",
        "search_too_long",
      );
    });

    test("whitespace around a 100-character query is not counted", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      const result = await listRows(t, creatorId, {
        search: ` ${"a".repeat(100)} `,
      });

      expect(result.totalCount).toBe(0);
    });
  });

  describe("filters", () => {
    test("starred keeps only the creator's starred opportunities", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const otherId = await seedCreatorId(t, "creator_b");
      const starred = await seedRow(t, creatorId, { title: "Starred" });
      const byOther = await seedRow(t, creatorId, {
        title: "Starred by someone else",
      });
      await seedRow(t, creatorId, { title: "Plain" });
      await t.run(async (ctx) => {
        await ctx.db.insert("opportunityStars", {
          creatorId,
          opportunityId: starred.opportunityId,
        });
        await ctx.db.insert("opportunityStars", {
          creatorId: otherId,
          opportunityId: byOther.opportunityId,
        });
      });

      const all = await listRows(t, creatorId, {
        sort: { key: "name", direction: "ascending" },
      });
      const onlyStarred = await listRows(t, creatorId, { starred: true });

      expect(all.rows.map((row) => [row.title, row.isStarred])).toEqual([
        ["Plain", false],
        ["Starred", true],
        ["Starred by someone else", false],
      ]);
      expect(titles(onlyStarred)).toEqual(["Starred"]);
      expect(onlyStarred.totalCount).toBe(1);
    });

    test("hide rejected removes rejected applications but keeps opportunityFull", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Waiting" });
      await seedRow(t, creatorId, { title: "Turned down", status: "rejected" });
      await seedRow(t, creatorId, {
        title: "Filled up",
        status: "opportunityFull",
      });

      const result = await listRows(t, creatorId, {
        hideRejected: true,
        sort: { key: "name", direction: "ascending" },
      });

      expect(titles(result)).toEqual(["Filled up", "Waiting"]);
      expect(result.totalCount).toBe(2);
      expect(result.counts.applications.count).toBe(3);
    });

    test("search, starred and hide rejected combine", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const match = await seedRow(t, creatorId, { title: "Serum video" });
      const rejected = await seedRow(t, creatorId, {
        title: "Serum rejected",
        status: "rejected",
      });
      const unmatched = await seedRow(t, creatorId, { title: "Sneakers" });
      await t.run(async (ctx) => {
        for (const row of [match, rejected, unmatched]) {
          await ctx.db.insert("opportunityStars", {
            creatorId,
            opportunityId: row.opportunityId,
          });
        }
      });

      const result = await listRows(t, creatorId, {
        search: "serum",
        starred: true,
        hideRejected: true,
      });

      expect(titles(result)).toEqual(["Serum video"]);
    });
  });

  describe("sorting", () => {
    // Created in this order, so submitted ascending is r1, r2, r3.
    async function seedSortRows(t: TestConvex, creatorId: Id<"creators">) {
      await seedRow(t, creatorId, {
        title: "Charlie",
        companyName: "Acme",
        status: "rejected",
        fixedFeeCents: 100,
        cpmRateCents: 500,
      });
      await seedRow(t, creatorId, {
        title: "Alpha",
        companyName: "Zeta",
        status: "pending",
        fixedFeeCents: 50,
        cpmRateCents: 900,
      });
      await seedRow(t, creatorId, {
        title: "Bravo",
        companyName: "Mid",
        status: "opportunityFull",
        fixedFeeCents: 100,
        cpmRateCents: 100,
      });
    }

    test.each([
      { key: "name", ascending: ["Alpha", "Bravo", "Charlie"] },
      { key: "company", ascending: ["Charlie", "Bravo", "Alpha"] },
      // Waiting first, then closed by fill, then rejected.
      { key: "status", ascending: ["Alpha", "Bravo", "Charlie"] },
      { key: "submitted", ascending: ["Charlie", "Alpha", "Bravo"] },
      // Fixed fee first, then CPM rate.
      { key: "compensation", ascending: ["Alpha", "Bravo", "Charlie"] },
    ] as const)("sorts by $key in both directions", async ({ key, ascending }) => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedSortRows(t, creatorId);

      const up = await listRows(t, creatorId, {
        sort: { key, direction: "ascending" },
      });
      const down = await listRows(t, creatorId, {
        sort: { key, direction: "descending" },
      });

      expect(titles(up)).toEqual(ascending);
      expect(titles(down)).toEqual([...ascending].reverse());
    });

    test("defaults to newest submitted first", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedSortRows(t, creatorId);

      const result = await listRows(t, creatorId);

      expect(titles(result)).toEqual(["Bravo", "Alpha", "Charlie"]);
    });

    test("ties are broken by newest submitted first, in either direction", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Same", companyName: "Older" });
      await seedRow(t, creatorId, { title: "Same", companyName: "Newer" });
      await seedRow(t, creatorId, { title: "Alpha", companyName: "Other" });
      const companies = (result: Awaited<ReturnType<typeof listRows>>) =>
        result.rows.map((row) => row.companyName);

      const up = await listRows(t, creatorId, {
        sort: { key: "name", direction: "ascending" },
      });
      const down = await listRows(t, creatorId, {
        sort: { key: "name", direction: "descending" },
      });

      expect(companies(up)).toEqual(["Other", "Newer", "Older"]);
      expect(companies(down)).toEqual(["Newer", "Older", "Other"]);
    });
  });

  describe("pagination", () => {
    async function seedSeven(t: TestConvex) {
      const creatorId = await seedCreatorId(t, "creator_a");
      for (let i = 1; i <= 7; i++) await seedRow(t, creatorId, { title: `Row ${i}` });
      return creatorId;
    }

    test("the last page holds the remainder, with totals", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedSeven(t);

      const result = await listRows(t, creatorId, { page: 3, pageSize: 3 });

      expect(titles(result)).toEqual(["Row 1"]);
      expect(result).toMatchObject({
        page: 3,
        pageSize: 3,
        totalCount: 7,
        pageCount: 3,
      });
    });

    test("a middle page holds a full page of the newest-first order", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedSeven(t);

      const result = await listRows(t, creatorId, { page: 2, pageSize: 3 });

      expect(titles(result)).toEqual(["Row 4", "Row 3", "Row 2"]);
    });

    test("a page past the end clamps to the last page", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedSeven(t);

      const result = await listRows(t, creatorId, { page: 9, pageSize: 3 });

      expect(result).toMatchObject({ page: 3, pageCount: 3 });
      expect(titles(result)).toEqual(["Row 1"]);
    });

    test("no rows gives page 1 of 0 pages", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      const result = await listRows(t, creatorId, { page: 4 });

      expect(result).toMatchObject({
        rows: [],
        page: 1,
        totalCount: 0,
        pageCount: 0,
      });
    });

    test("filters change the total and page count", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedSeven(t);

      const result = await listRows(t, creatorId, {
        pageSize: 3,
        search: "Row 1",
      });

      expect(result).toMatchObject({ totalCount: 1, pageCount: 1 });
    });

    test("pageSize may be exactly 50", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      const result = await listRows(t, creatorId, { pageSize: 50 });

      expect(result.pageSize).toBe(50);
    });

    test.each([
      { name: "page 0", args: { page: 0 }, reason: "invalid_page" },
      { name: "a negative page", args: { page: -1 }, reason: "invalid_page" },
      {
        name: "a fractional page",
        args: { page: 1.5 },
        reason: "invalid_page",
      },
      {
        name: "an infinite page",
        args: { page: Infinity },
        reason: "invalid_page",
      },
      {
        name: "page size 0",
        args: { pageSize: 0 },
        reason: "invalid_page_size",
      },
      {
        name: "page size 51",
        args: { pageSize: 51 },
        reason: "invalid_page_size",
      },
      {
        name: "a fractional page size",
        args: { pageSize: 2.5 },
        reason: "invalid_page_size",
      },
    ])("refuses $name", async ({ args, reason }) => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");

      await expectApiError(() => listRows(t, creatorId, args), "invalid_state", reason);
    });
  });

  describe("opportunities creators can no longer see", () => {
    test.each<{
      name: string;
      hide: (ctx: MutationCtx, seeded: Awaited<ReturnType<typeof seedRow>>) => Promise<unknown>;
    }>([
      {
        name: "the opportunity is closed",
        hide: (ctx, s) => ctx.db.patch("opportunities", s.opportunityId, { status: "closed" }),
      },
      {
        name: "the opportunity is paused",
        hide: (ctx, s) => ctx.db.patch("opportunities", s.opportunityId, { status: "paused" }),
      },
      {
        name: "the campaign is closed",
        hide: (ctx, s) => ctx.db.patch("campaigns", s.campaignId, { status: "closed" }),
      },
      {
        name: "the company is inactive",
        hide: (ctx, s) => ctx.db.patch("companies", s.companyId, { isActive: false }),
      },
    ])("the row keeps its details but can't be starred when $name", async ({ hide }) => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const seeded = await seedRow(t, creatorId, {
        title: "Gone dark",
        companyName: "Glow Labs",
        fixedFeeCents: 12_000,
        cpmRateCents: 300,
        paymentCapCents: 40_000,
      });
      await t.run((ctx) => hide(ctx, seeded));

      const result = await listRows(t, creatorId);

      expect(result.rows).toMatchObject([
        {
          title: "Gone dark",
          companyName: "Glow Labs",
          fixedFeeCents: 12_000,
          cpmRateCents: 300,
          paymentCapCents: 40_000,
          canStar: false,
        },
      ]);
    });

    test("an open opportunity can be starred", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId);

      const result = await listRows(t, creatorId);

      expect(result.rows[0].canStar).toBe(true);
    });

    test("a starred opportunity stays starred after it closes", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const { opportunityId } = await seedRow(t, creatorId);
      await t.run(async (ctx) => {
        await ctx.db.insert("opportunityStars", { creatorId, opportunityId });
        await ctx.db.patch("opportunities", opportunityId, {
          status: "closed",
        });
      });

      const result = await listRows(t, creatorId, { starred: true });

      expect(result.rows).toMatchObject([{ isStarred: true, canStar: false }]);
    });
  });

  describe("read bound", () => {
    test("reads at most the limit, newest first, and reports the cap", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      for (let i = 1; i <= 5; i++) await seedRow(t, creatorId, { title: `Row ${i}` });

      const result = await listRows(t, creatorId, {}, { limit: 3 });

      expect(titles(result)).toEqual(["Row 5", "Row 4", "Row 3"]);
      expect(result.totalCount).toBe(3);
      expect(result.counts.applications).toEqual({ count: 3, isCapped: true });
    });

    test("the limit is shared across the tab's statuses", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Pending 1" });
      await seedRow(t, creatorId, { title: "Pending 2" });
      await seedRow(t, creatorId, { title: "Rejected 1", status: "rejected" });
      await seedRow(t, creatorId, { title: "Rejected 2", status: "rejected" });

      const result = await listRows(
        t,
        creatorId,
        { sort: { key: "name", direction: "ascending" } },
        { limit: 3 },
      );

      expect(titles(result)).toEqual(["Pending 1", "Pending 2", "Rejected 2"]);
      expect(result.counts.applications).toEqual({ count: 3, isCapped: true });
    });

    test("under the limit nothing is reported capped", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId);
      await seedRow(t, creatorId);

      const result = await listRows(t, creatorId, {}, { limit: 3 });

      expect(result.counts.applications).toEqual({ count: 2, isCapped: false });
    });

    test("the offers and accepted counts are capped too", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      for (const status of ["offered", "offerExpired", "declined"] as const) {
        await seedRow(t, creatorId, { status });
      }
      await seedRow(t, creatorId, { status: "accepted" });

      const result = await listRows(t, creatorId, {}, { limit: 2 });

      expect(result.counts.offers).toEqual({ count: 2, isCapped: true });
      expect(result.counts.accepted).toEqual({ count: 1, isCapped: false });
    });
  });
});
