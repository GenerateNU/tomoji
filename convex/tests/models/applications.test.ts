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
  requireApplicationDetail,
} from "../../models/applications";
import { cancelPendingAssignment, declineAssignmentTerms } from "../../models/assignments";
import { updateOpportunityLanguages } from "../../models/opportunityLanguages";
import { updateOpportunityNiches } from "../../models/opportunityNiches";
import { updateOpportunitySkills } from "../../models/opportunitySkills";
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

    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );
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
  /** The assignments a creator holds on an opportunity, as stored. */
  async function assignmentsOf(
    t: TestConvex,
    opportunityId: Id<"opportunities">,
    creatorId: Id<"creators">,
  ) {
    return await t.run(async (ctx) =>
      ctx.db
        .query("assignments")
        .withIndex("by_opportunityId_and_creatorId", (q) =>
          q.eq("opportunityId", opportunityId).eq("creatorId", creatorId),
        )
        .take(2),
    );
  }

  async function filledSlotsOf(t: TestConvex, opportunityId: Id<"opportunities">) {
    return (await t.run((ctx) => ctx.db.get("opportunities", opportunityId)))?.numFilledSlots;
  }

  test("accepts the offer, takes a slot, and creates an active assignment with the opportunity's terms", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, creatorId, applicationId } = await seedOffered(t);
    const before = Date.now();

    const accepted = await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
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

    expect(accepted.application.status).toBe("accepted");
    expect(accepted.application.offerAcceptedAt).toBeGreaterThanOrEqual(before);
    expect(accepted.application.statusLastUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(opportunity?.numFilledSlots).toBe(1);
    expect(assignments).toHaveLength(1);
    expect(accepted.assignmentId).toBe(assignments[0]._id);
    expect(assignments[0]).toMatchObject({
      status: "active",
      termsAcceptedAt: accepted.application.offerAcceptedAt,
      fixedFeeCents: opportunity?.fixedFeeCents,
      cpmRateCents: opportunity?.cpmRateCents,
      paymentCapCents: opportunity?.paymentCapCents,
      usesAiReview: opportunity?.usesAiReviewDefault,
    });
    expect(assignments[0].termsAcceptedAt).toBeGreaterThanOrEqual(before);
  });

  test.each([
    { name: "omitted", options: {} },
    { name: "false", options: { acceptedTerms: false } },
  ])(
    "refuses when acceptedTerms is $name and the opportunity has a review policy, and changes nothing",
    async ({ options }) => {
      const t = convexTest(schema, modules);
      const { membership, opportunityId, creatorId, applicationId } = await seedOffered(t);
      const noticesBefore = await memberNotifications(t, membership);

      await expectApiError(
        () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId, options)),
        "invalid_state",
        "terms_not_accepted",
      );

      const stored = await t.run((ctx) => ctx.db.get("applications", applicationId));
      expect(stored?.status).toBe("offered");
      expect(stored?.offerAcceptedAt).toBeUndefined();
      expect(await filledSlotsOf(t, opportunityId)).toBe(0);
      expect(await assignmentsOf(t, opportunityId, creatorId)).toEqual([]);
      expect(await memberNotifications(t, membership)).toEqual(noticesBefore);
    },
  );

  test.each(["", "  \n\t "])(
    "accepts without acceptedTerms when the review policy is blank (%j)",
    async (reviewPolicy) => {
      const t = convexTest(schema, modules);
      const { opportunityId, creatorId, applicationId } = await seedOffered(t, {
        opportunity: { reviewPolicy },
      });

      const accepted = await t.run(
        async (ctx) => await acceptApplication(ctx, creatorId, applicationId),
      );

      const assignments = await assignmentsOf(t, opportunityId, creatorId);
      expect(accepted.application.status).toBe("accepted");
      expect(assignments).toMatchObject([
        { _id: accepted.assignmentId, status: "active", termsAcceptedAt: expect.any(Number) },
      ]);
    },
  );

  test("acceptedTerms: true is accepted on an opportunity without a review policy", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { reviewPolicy: "" },
    });

    const accepted = await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );

    expect(accepted.application.status).toBe("accepted");
    expect(await assignmentsOf(t, opportunityId, creatorId)).toMatchObject([{ status: "active" }]);
  });

  test("an expired offer is refused as offer_expired even without acceptedTerms", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedOffered(t);
    await t.run((ctx) =>
      ctx.db.patch("applications", applicationId, { offerExpiresAt: Date.now() - 1 }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
      "offer_expired",
    );
  });

  test("an accepted offer's assignment can't be cancelled as pending or have its terms declined", async () => {
    const t = convexTest(schema, modules);
    const { companyId, creatorId, applicationId } = await seedOffered(t);
    const { assignmentId } = await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );

    await expectApiError(
      () => t.run((ctx) => cancelPendingAssignment(ctx, companyId, assignmentId)),
      "invalid_state",
      "assignment_not_pending",
    );
    await expectApiError(
      () => t.run((ctx) => declineAssignmentTerms(ctx, creatorId, assignmentId)),
      "invalid_state",
      "assignment_not_pending",
    );
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
        async (ctx) =>
          await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
      );

      expect(accepted.application.status).toBe("accepted");
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
    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );
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

    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );
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
    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );
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

    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );

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

  test("accepting an offer sends one applicationAccepted notice and no assignmentTermsAccepted", async () => {
    const t = convexTest(schema, modules);
    const { membership, creatorId, applicationId } = await seedOffered(t);
    const before = (await memberNotifications(t, membership)).length;

    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );

    const added = (await memberNotifications(t, membership)).slice(before);
    expect(added.map((n) => n.type)).toEqual(["applicationAccepted"]);
  });

  test("taking the last slot notifies each creator whose application became full", async () => {
    const t = convexTest(schema, modules);
    const { companyId, opportunityId, creatorId, applicationId } = await seedOffered(t, {
      opportunity: { maxSlots: 1 },
    });
    const otherCreatorId = await seedCreatorId(t, "creator_b");
    const otherId = await applyAs(t, otherCreatorId, opportunityId);
    await t.run(async (ctx) => await offerApplication(ctx, companyId, otherId));

    await t.run(
      async (ctx) =>
        await acceptApplication(ctx, creatorId, applicationId, { acceptedTerms: true }),
    );
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
    offerExpiresAt?: number;
    offerAcceptedAt?: number;
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
    const { title, companyName, status, offerExpiresAt, offerAcceptedAt, ...terms } = seed;
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
        ...(offerExpiresAt === undefined ? {} : { offerExpiresAt }),
        ...(offerAcceptedAt === undefined ? {} : { offerAcceptedAt }),
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

    test("hide rejected removes both rejected and opportunityFull applications", async () => {
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

      expect(titles(result)).toEqual(["Waiting"]);
      expect(result.totalCount).toBe(1);
      expect(result.counts.applications.count).toBe(3);
    });

    test("hide rejected leaves a tab of only full and rejected rows empty", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Turned down", status: "rejected" });
      await seedRow(t, creatorId, { title: "Filled up", status: "opportunityFull" });

      const result = await listRows(t, creatorId, { hideRejected: true });

      expect(result.rows).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.counts.applications).toEqual({ count: 2, isCapped: false });
    });

    test("without hide rejected, rejected and opportunityFull rows are both listed", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Turned down", status: "rejected" });
      await seedRow(t, creatorId, { title: "Filled up", status: "opportunityFull" });

      const result = await listRows(t, creatorId, { hideRejected: false });

      expect(titles(result).sort()).toEqual(["Filled up", "Turned down"]);
      expect(result.totalCount).toBe(2);
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

    describe("by status", () => {
      // Seeded oldest to newest: Old rejected, Mid pending, Full full, New rejected.
      async function seedStatusRows(t: TestConvex, creatorId: Id<"creators">) {
        await seedRow(t, creatorId, { title: "Old rejected", status: "rejected" });
        await seedRow(t, creatorId, { title: "Mid pending", status: "pending" });
        await seedRow(t, creatorId, { title: "Full", status: "opportunityFull" });
        await seedRow(t, creatorId, { title: "New rejected", status: "rejected" });
      }

      test("ascending lists pending first, then rejected and full as one group, newest first", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedStatusRows(t, creatorId);

        const result = await listRows(t, creatorId, {
          sort: { key: "status", direction: "ascending" },
        });

        expect(titles(result)).toEqual(["Mid pending", "New rejected", "Full", "Old rejected"]);
      });

      test("descending lists rejected and full as one group, newest first, then pending", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedStatusRows(t, creatorId);

        const result = await listRows(t, creatorId, {
          sort: { key: "status", direction: "descending" },
        });

        expect(titles(result)).toEqual(["New rejected", "Full", "Old rejected", "Mid pending"]);
      });
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

  describe("offers tab", () => {
    const BASE = Date.parse("2026-10-13T12:00:00Z");
    const HOUR = 60 * 60 * 1000;
    const offers = { tab: "offers" } as const;

    /** Seeded out of order, so only the sort can produce the expected order. */
    async function seedExpiryRows(t: TestConvex, creatorId: Id<"creators">) {
      const rows: RowSeed[] = [
        {
          title: "Declined -1d",
          status: "declined",
          offerExpiresAt: BASE - DAY,
        },
        {
          title: "Offered +12d",
          status: "offered",
          offerExpiresAt: BASE + 12 * DAY,
        },
        { title: "Expired none", status: "offerExpired" },
        {
          title: "Offered +18h",
          status: "offered",
          offerExpiresAt: BASE + 18 * HOUR,
        },
        {
          title: "Declined -3d",
          status: "declined",
          offerExpiresAt: BASE - 3 * DAY,
        },
        { title: "Offered none", status: "offered" },
        {
          title: "Expired -1d",
          status: "offerExpired",
          offerExpiresAt: BASE - DAY,
        },
        {
          title: "Offered +10d",
          status: "offered",
          offerExpiresAt: BASE + 10 * DAY,
        },
        {
          title: "Expired -2d",
          status: "offerExpired",
          offerExpiresAt: BASE - 2 * DAY,
        },
      ];
      for (const row of rows) await seedRow(t, creatorId, row);
    }

    const expiresAscending = [
      "Offered +18h",
      "Offered +10d",
      "Offered +12d",
      "Offered none",
      "Expired -2d",
      "Expired -1d",
      "Expired none",
      "Declined -3d",
      "Declined -1d",
    ];

    test("lists exactly the offered, expired and declined applications, with counts for each tab", async () => {
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

      const result = await listRows(t, creatorId, offers);

      expect(titles(result).sort()).toEqual(["declined", "offerExpired", "offered"]);
      expect(result.totalCount).toBe(3);
      expect(result.counts).toEqual({
        applications: { count: 3, isCapped: false },
        offers: { count: 3, isCapped: false },
        accepted: { count: 1, isCapped: false },
      });
    });

    test("only the calling creator's offers are listed", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const otherId = await seedCreatorId(t, "creator_b");
      await seedRow(t, creatorId, { title: "Mine", status: "offered" });
      await seedRow(t, otherId, { title: "Theirs", status: "offered" });

      const result = await listRows(t, creatorId, offers);

      expect(titles(result)).toEqual(["Mine"]);
      expect(result.counts.offers.count).toBe(1);
    });

    test("a row carries offerExpiresAt when the application has one", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, {
        title: "Offered",
        status: "offered",
        offerExpiresAt: BASE + DAY,
      });

      const result = await listRows(t, creatorId, offers);

      expect(result.rows).toMatchObject([{ title: "Offered", offerExpiresAt: BASE + DAY }]);
    });

    test("an offer without an expiry has no offerExpiresAt", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { status: "offered" });

      const result = await listRows(t, creatorId, offers);

      expect(result.rows[0]).not.toHaveProperty("offerExpiresAt");
    });

    test("an applications row has no offerExpiresAt", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { status: "pending" });

      const result = await listRows(t, creatorId);

      expect(result.rows[0]).not.toHaveProperty("offerExpiresAt");
    });

    test("sorting by expires ascending lists offered, then expired, then declined, soonest first with missing last", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedExpiryRows(t, creatorId);

      const result = await listRows(t, creatorId, {
        ...offers,
        sort: { key: "expires", direction: "ascending" },
      });

      expect(titles(result)).toEqual(expiresAscending);
    });

    test("sorting by expires descending keeps the group order and still puts missing last", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedExpiryRows(t, creatorId);

      const result = await listRows(t, creatorId, {
        ...offers,
        sort: { key: "expires", direction: "descending" },
      });

      expect(titles(result)).toEqual([
        "Offered +12d",
        "Offered +10d",
        "Offered +18h",
        "Offered none",
        "Expired -1d",
        "Expired -2d",
        "Expired none",
        "Declined -1d",
        "Declined -3d",
      ]);
    });

    test.each(["ascending", "descending"] as const)(
      "equal expiries are broken by newest submitted first when sorting %s",
      async (direction) => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        const expiresAt = BASE + DAY;
        await seedRow(t, creatorId, {
          title: "Older",
          status: "offered",
          offerExpiresAt: expiresAt,
        });
        await seedRow(t, creatorId, {
          title: "Newer",
          status: "offered",
          offerExpiresAt: expiresAt,
        });

        const result = await listRows(t, creatorId, {
          ...offers,
          sort: { key: "expires", direction },
        });

        expect(titles(result)).toEqual(["Newer", "Older"]);
      },
    );

    test("with no sort, the offers tab lists the soonest expiry first", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedExpiryRows(t, creatorId);

      const result = await listRows(t, creatorId, offers);

      expect(titles(result)).toEqual(expiresAscending);
    });

    test("with no sort, the applications tab still lists the newest submitted first", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "First" });
      await seedRow(t, creatorId, { title: "Second" });

      const result = await listRows(t, creatorId);

      expect(titles(result)).toEqual(["Second", "First"]);
    });

    test("sorting by status lists offered, expired, then declined, and reverses", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Declined", status: "declined" });
      await seedRow(t, creatorId, { title: "Offered", status: "offered" });
      await seedRow(t, creatorId, { title: "Expired", status: "offerExpired" });

      const up = await listRows(t, creatorId, {
        ...offers,
        sort: { key: "status", direction: "ascending" },
      });
      const down = await listRows(t, creatorId, {
        ...offers,
        sort: { key: "status", direction: "descending" },
      });

      expect(titles(up)).toEqual(["Offered", "Expired", "Declined"]);
      expect(titles(down)).toEqual(["Declined", "Expired", "Offered"]);
    });

    test("search and starred filter offers", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const starred = await seedRow(t, creatorId, {
        title: "Serum video",
        status: "offered",
      });
      await seedRow(t, creatorId, {
        title: "Serum unstarred",
        status: "offered",
      });
      const other = await seedRow(t, creatorId, {
        title: "Sneakers",
        status: "offered",
      });
      await t.run(async (ctx) => {
        for (const row of [starred, other]) {
          await ctx.db.insert("opportunityStars", {
            creatorId,
            opportunityId: row.opportunityId,
          });
        }
      });

      const searched = await listRows(t, creatorId, {
        ...offers,
        search: "serum",
      });
      const searchedAndStarred = await listRows(t, creatorId, {
        ...offers,
        search: "serum",
        starred: true,
      });

      expect(titles(searched).sort()).toEqual(["Serum unstarred", "Serum video"]);
      expect(titles(searchedAndStarred)).toEqual(["Serum video"]);
    });

    test("hide rejected has no effect on the offers tab, so declined offers stay", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Open", status: "offered" });
      await seedRow(t, creatorId, { title: "Turned down", status: "declined" });

      const result = await listRows(t, creatorId, {
        ...offers,
        hideRejected: true,
      });

      expect(titles(result).sort()).toEqual(["Open", "Turned down"]);
      expect(result.totalCount).toBe(2);
    });

    test("pages through the offers with totals", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      for (let i = 1; i <= 5; i++) {
        await seedRow(t, creatorId, { title: `Offer ${i}`, status: "offered" });
      }
      const args = {
        ...offers,
        pageSize: 2,
        sort: { key: "submitted", direction: "descending" },
      } as const;

      const second = await listRows(t, creatorId, { ...args, page: 2 });
      const last = await listRows(t, creatorId, { ...args, page: 3 });

      expect(titles(second)).toEqual(["Offer 3", "Offer 2"]);
      expect(titles(last)).toEqual(["Offer 1"]);
      expect(last).toMatchObject({
        page: 3,
        pageSize: 2,
        totalCount: 5,
        pageCount: 3,
      });
    });

    test("reads at most the limit, newest first, and reports the offers tab capped", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      for (let i = 1; i <= 5; i++) {
        await seedRow(t, creatorId, { title: `Offer ${i}`, status: "offered" });
      }

      const result = await listRows(
        t,
        creatorId,
        { ...offers, sort: { key: "submitted", direction: "descending" } },
        { limit: 3 },
      );

      expect(titles(result)).toEqual(["Offer 5", "Offer 4", "Offer 3"]);
      expect(result.totalCount).toBe(3);
      expect(result.counts.offers).toEqual({ count: 3, isCapped: true });
    });

    test("the offers count skips an offer whose opportunity was deleted", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Kept", status: "offered" });
      const gone = await seedRow(t, creatorId, {
        title: "Gone",
        status: "offered",
      });
      await t.run((ctx) => ctx.db.delete("opportunities", gone.opportunityId));

      const result = await listRows(t, creatorId, offers);

      expect(titles(result)).toEqual(["Kept"]);
      expect(result.counts.offers.count).toBe(1);
    });

    test.each(["applications", "offers", "accepted"] as const)(
      "echoes the %s tab it was asked for",
      async (tab) => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");

        const result = await listRows(t, creatorId, { tab });

        expect(result.tab).toBe(tab);
      },
    );
  });

  describe("accepted tab", () => {
    const BASE = Date.parse("2026-10-13T12:00:00Z");
    const accepted = { tab: "accepted" } as const;

    test("lists only the accepted applications, with the same counts as on any other tab", async () => {
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

      const result = await listRows(t, creatorId, accepted);
      const onApplications = await listRows(t, creatorId, { tab: "applications" });

      expect(result.tab).toBe("accepted");
      expect(titles(result)).toEqual(["accepted"]);
      expect(result.rows[0].status).toBe("accepted");
      expect(result.totalCount).toBe(1);
      expect(result.counts).toEqual({
        applications: { count: 3, isCapped: false },
        offers: { count: 3, isCapped: false },
        accepted: { count: 1, isCapped: false },
      });
      expect(result.counts).toEqual(onApplications.counts);
    });

    test("only the calling creator's accepted applications are listed", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      const otherId = await seedCreatorId(t, "creator_b");
      await seedRow(t, creatorId, { title: "Mine", status: "accepted" });
      await seedRow(t, otherId, { title: "Theirs", status: "accepted" });

      const result = await listRows(t, creatorId, accepted);

      expect(titles(result)).toEqual(["Mine"]);
      expect(result.counts.accepted.count).toBe(1);
    });

    test("a row carries offerAcceptedAt when it is set", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, {
        status: "accepted",
        offerAcceptedAt: BASE - DAY,
      });

      const result = await listRows(t, creatorId, accepted);

      expect(result.rows[0].offerAcceptedAt).toBe(BASE - DAY);
    });

    test("a row has no offerAcceptedAt key when it is unset", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { status: "accepted" });

      const result = await listRows(t, creatorId, accepted);

      expect(result.rows[0]).not.toHaveProperty("offerAcceptedAt");
    });

    test("sorts newest accepted first by default", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, {
        title: "Accepted -2d",
        status: "accepted",
        offerAcceptedAt: BASE - 2 * DAY,
      });
      await seedRow(t, creatorId, {
        title: "Accepted -1h",
        status: "accepted",
        offerAcceptedAt: BASE - 60 * 60 * 1000,
      });
      await seedRow(t, creatorId, {
        title: "Accepted -5d",
        status: "accepted",
        offerAcceptedAt: BASE - 5 * DAY,
      });

      const result = await listRows(t, creatorId, accepted);

      expect(titles(result)).toEqual(["Accepted -1h", "Accepted -2d", "Accepted -5d"]);
    });

    describe("accepted sort", () => {
      /** Seeded out of order, so only the sort can produce the expected order. */
      async function seedAcceptedRows(t: TestConvex, creatorId: Id<"creators">) {
        const rows: RowSeed[] = [
          { title: "Accepted -2d", offerAcceptedAt: BASE - 2 * DAY },
          { title: "Accepted none" },
          { title: "Accepted -1d", offerAcceptedAt: BASE - DAY },
          { title: "Accepted -3d", offerAcceptedAt: BASE - 3 * DAY },
        ];
        for (const row of rows) await seedRow(t, creatorId, { ...row, status: "accepted" });
      }

      test("ascending puts the oldest first and a missing time last", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedAcceptedRows(t, creatorId);

        const result = await listRows(t, creatorId, {
          ...accepted,
          sort: { key: "accepted", direction: "ascending" },
        });

        expect(titles(result)).toEqual([
          "Accepted -3d",
          "Accepted -2d",
          "Accepted -1d",
          "Accepted none",
        ]);
      });

      test("descending puts the newest first and a missing time still last", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedAcceptedRows(t, creatorId);

        const result = await listRows(t, creatorId, {
          ...accepted,
          sort: { key: "accepted", direction: "descending" },
        });

        expect(titles(result)).toEqual([
          "Accepted -1d",
          "Accepted -2d",
          "Accepted -3d",
          "Accepted none",
        ]);
      });

      test.each(["ascending", "descending"] as const)(
        "ties on the accepted time fall back to newest submitted first when %s",
        async (direction) => {
          const t = convexTest(schema, modules);
          const creatorId = await seedCreatorId(t, "creator_a");
          for (const title of ["Tie first", "Tie second", "Tie third"]) {
            await seedRow(t, creatorId, {
              title,
              status: "accepted",
              offerAcceptedAt: BASE - DAY,
            });
          }

          const result = await listRows(t, creatorId, {
            ...accepted,
            sort: { key: "accepted", direction },
          });

          expect(titles(result)).toEqual(["Tie third", "Tie second", "Tie first"]);
        },
      );

      test("rows missing the accepted time are ordered newest submitted first", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        for (const title of ["None first", "None second"]) {
          await seedRow(t, creatorId, { title, status: "accepted" });
        }

        const result = await listRows(t, creatorId, {
          ...accepted,
          sort: { key: "accepted", direction: "ascending" },
        });

        expect(titles(result)).toEqual(["None second", "None first"]);
      });
    });

    describe("other sorts", () => {
      async function seedSortRows(t: TestConvex, creatorId: Id<"creators">) {
        const rows: RowSeed[] = [
          { title: "Bravo", companyName: "Zeta Co", fixedFeeCents: 20_000, cpmRateCents: 100 },
          { title: "Charlie", companyName: "Alpha Co", fixedFeeCents: 5_000, cpmRateCents: 400 },
          { title: "Alpha", companyName: "Mid Co", fixedFeeCents: 20_000, cpmRateCents: 300 },
        ];
        for (const row of rows) {
          await seedRow(t, creatorId, {
            ...row,
            status: "accepted",
            offerAcceptedAt: BASE - DAY,
          });
        }
      }

      test.each([
        {
          key: "name",
          direction: "ascending",
          expected: ["Alpha", "Bravo", "Charlie"],
        },
        {
          key: "name",
          direction: "descending",
          expected: ["Charlie", "Bravo", "Alpha"],
        },
        {
          key: "company",
          direction: "ascending",
          expected: ["Charlie", "Alpha", "Bravo"],
        },
        {
          key: "company",
          direction: "descending",
          expected: ["Bravo", "Alpha", "Charlie"],
        },
        {
          key: "compensation",
          direction: "ascending",
          expected: ["Charlie", "Bravo", "Alpha"],
        },
        {
          key: "compensation",
          direction: "descending",
          expected: ["Alpha", "Bravo", "Charlie"],
        },
      ] as const)("sorts by $key $direction", async ({ key, direction, expected }) => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedSortRows(t, creatorId);

        const result = await listRows(t, creatorId, {
          ...accepted,
          sort: { key, direction },
        });

        expect(titles(result)).toEqual(expected);
      });
    });

    describe("search and filters", () => {
      test.each([
        { name: "title", search: "serum" },
        { name: "company name", search: "glow" },
      ])("search matches on $name", async ({ search }) => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedRow(t, creatorId, {
          title: "Serum launch",
          companyName: "Glow Labs",
          status: "accepted",
        });
        await seedRow(t, creatorId, {
          title: "Sneakers",
          companyName: "Stride",
          status: "accepted",
        });
        await seedRow(t, creatorId, {
          title: "Serum pending",
          companyName: "Glow Labs",
        });

        const result = await listRows(t, creatorId, { ...accepted, search });

        expect(titles(result)).toEqual(["Serum launch"]);
        expect(result.totalCount).toBe(1);
      });

      test("the starred filter keeps only starred accepted rows", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        const starred = await seedRow(t, creatorId, {
          title: "Starred",
          status: "accepted",
        });
        await seedRow(t, creatorId, { title: "Plain", status: "accepted" });
        await t.run((ctx) =>
          ctx.db.insert("opportunityStars", {
            creatorId,
            opportunityId: starred.opportunityId,
          }),
        );

        const result = await listRows(t, creatorId, { ...accepted, starred: true });

        expect(result.rows).toMatchObject([{ title: "Starred", isStarred: true }]);
      });

      test("hideRejected does nothing", async () => {
        const t = convexTest(schema, modules);
        const creatorId = await seedCreatorId(t, "creator_a");
        await seedRow(t, creatorId, { title: "One", status: "accepted" });
        await seedRow(t, creatorId, { title: "Two", status: "accepted" });

        const result = await listRows(t, creatorId, { ...accepted, hideRejected: true });

        expect(result.totalCount).toBe(2);
      });
    });

    test("an accepted application whose opportunity was deleted is skipped and not counted", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      await seedRow(t, creatorId, { title: "Kept", status: "accepted" });
      const gone = await seedRow(t, creatorId, { title: "Gone", status: "accepted" });
      await t.run((ctx) => ctx.db.delete("opportunities", gone.opportunityId));

      const result = await listRows(t, creatorId, accepted);

      expect(titles(result)).toEqual(["Kept"]);
      expect(result.totalCount).toBe(1);
      expect(result.counts.accepted).toEqual({ count: 1, isCapped: false });
    });

    test("reads at most the limit, newest first, and reports the cap", async () => {
      const t = convexTest(schema, modules);
      const creatorId = await seedCreatorId(t, "creator_a");
      for (let i = 1; i <= 5; i++) {
        await seedRow(t, creatorId, {
          title: `Accepted ${i}`,
          status: "accepted",
          offerAcceptedAt: BASE + i * DAY,
        });
      }

      const result = await listRows(t, creatorId, accepted, { limit: 3 });

      expect(titles(result)).toEqual(["Accepted 5", "Accepted 4", "Accepted 3"]);
      expect(result.totalCount).toBe(3);
      expect(result.counts.accepted).toEqual({ count: 3, isCapped: true });
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

describe("requireApplicationDetail", () => {
  type Seed = {
    status?: Doc<"applications">["status"];
    offerExpiresAt?: number | null;
    offerAcceptedAt?: number;
    opportunity?: Partial<WithoutSystemFields<Doc<"opportunities">>>;
  };

  /** Seeds an application from `creator_a`, offered with a day left unless the seed says otherwise. */
  async function seedDetail(t: TestConvex, seed: Seed = {}) {
    const seeded = await seedGatedOpportunity(t);
    const creatorId = await seedCreatorId(t, "creator_a");
    const applicationId = await applyAs(t, creatorId, seeded.opportunityId);
    // Applied while open; closed and full states only arise after the offer.
    if (seed.opportunity !== undefined) {
      await t.run((ctx) => ctx.db.patch("opportunities", seeded.opportunityId, seed.opportunity!));
    }
    const status = seed.status ?? "offered";
    const offerExpiresAt =
      seed.offerExpiresAt === undefined ? Date.now() + DAY : seed.offerExpiresAt;
    await t.run((ctx) =>
      ctx.db.patch("applications", applicationId, {
        status,
        ...(offerExpiresAt === null ? {} : { offerExpiresAt }),
        ...(seed.offerAcceptedAt === undefined ? {} : { offerAcceptedAt: seed.offerAcceptedAt }),
      }),
    );
    return { ...seeded, creatorId, applicationId };
  }

  async function detailOf(
    t: TestConvex,
    creatorId: Id<"creators">,
    applicationId: Id<"applications">,
  ) {
    return await t.run((ctx) => requireApplicationDetail(ctx, creatorId, applicationId));
  }

  test("a live offer carries the brief, the offer terms and both actions", async () => {
    const t = convexTest(schema, modules);
    const offerExpiresAt = Date.now() + DAY;
    const { companyId, opportunityId, creatorId, applicationId } = await seedDetail(t, {
      offerExpiresAt,
      opportunity: {
        title: "Spring serum launch",
        contentRequirements: "Two 20-second clips",
      },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("companies", companyId, { name: "Glow Labs" });
      await updateOpportunityNiches(ctx, opportunityId, ["databases"]);
      await updateOpportunitySkills(ctx, opportunityId, ["python"]);
      await updateOpportunityLanguages(ctx, opportunityId, ["english"]);
    });
    const application = await t.run((ctx) => ctx.db.get("applications", applicationId));

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).toMatchObject({
      applicationId,
      status: "offered",
      submittedAt: application?._creationTime,
      offerExpiresAt,
      canAccept: true,
      canDecline: true,
    });
    expect(detail).not.toHaveProperty("acceptBlockedReason");
    expect(detail.opportunity).toMatchObject({
      _id: opportunityId,
      title: "Spring serum launch",
      description: "Show the product in your daily skincare routine.",
      fixedFeeCents: 10_000,
      cpmRateCents: 500,
      paymentCapCents: 25_000,
      contentRequirements: "Two 20-second clips",
      reviewPolicy: "Disclose the paid partnership. No medical claims.",
      companyName: "Glow Labs",
      niches: ["databases"],
      skills: ["python"],
      languages: ["english"],
    });
  });

  test("carries the opportunity's minimum follower range when it has one", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      opportunity: { minFollowerRange: "100k-500k" },
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.minFollowerRange).toBe("100k-500k");
  });

  test("has no minFollowerRange or companyLogoMediaId when neither is set", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t);

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).not.toHaveProperty("minFollowerRange");
    expect(detail).not.toHaveProperty("companyLogoMediaId");
  });

  test("carries the company's logo when it has one", async () => {
    const t = convexTest(schema, modules);
    const { companyId, membership, creatorId, applicationId } = await seedDetail(t);
    const logoId = await t.run(async (ctx) => {
      const mediaId = await ctx.db.insert("mediaUploads", {
        ownerUserId: membership.userId,
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

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.companyLogoMediaId).toBe(logoId);
  });

  test("a paused opportunity can still be accepted", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      opportunity: { status: "paused" },
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).toMatchObject({ canAccept: true, canDecline: true });
    expect(detail).not.toHaveProperty("acceptBlockedReason");
  });

  test("a closed opportunity blocks accepting but not declining", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      opportunity: { status: "closed" },
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).toMatchObject({
      canAccept: false,
      canDecline: true,
      acceptBlockedReason: "opportunity_closed",
    });
  });

  test("a closed campaign and an inactive company still return the offer with the company name", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, companyId, creatorId, applicationId } = await seedDetail(t);
    await t.run(async (ctx) => {
      await ctx.db.patch("campaigns", campaignId, { status: "closed" });
      await ctx.db.patch("companies", companyId, {
        isActive: false,
        name: "Glow Labs",
      });
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.opportunity.companyName).toBe("Glow Labs");
    expect(detail).toMatchObject({ canAccept: true, canDecline: true });
  });

  test("a full opportunity blocks accepting but not declining", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      opportunity: { maxSlots: 1, numFilledSlots: 1 },
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).toMatchObject({
      canAccept: false,
      canDecline: true,
      acceptBlockedReason: "opportunity_full",
    });
  });

  test.each([
    { name: "closed", opportunity: { status: "closed" } as const },
    { name: "full", opportunity: { maxSlots: 1, numFilledSlots: 1 } },
  ])(
    "acceptApplication refuses a $name opportunity with the reason the detail reports",
    async ({ opportunity }) => {
      const t = convexTest(schema, modules);
      const { creatorId, applicationId } = await seedDetail(t, { opportunity });

      const detail = await detailOf(t, creatorId, applicationId);

      expect(detail.acceptBlockedReason).toBeDefined();
      await expectApiError(
        () => t.run((ctx) => acceptApplication(ctx, creatorId, applicationId)),
        "invalid_state",
        detail.acceptBlockedReason,
      );
    },
  );

  test.each<{ name: string; seed: Seed }>([
    {
      name: "an expired offer",
      seed: { status: "offerExpired", offerExpiresAt: Date.now() - DAY },
    },
    { name: "a declined offer", seed: { status: "declined" } },
    {
      name: "an accepted offer",
      seed: { status: "accepted", offerAcceptedAt: Date.now() - 1000 },
    },
    {
      name: "a pending application",
      seed: { status: "pending", offerExpiresAt: null },
    },
  ])("$name can be neither accepted nor declined", async ({ seed }) => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, seed);

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail).toMatchObject({
      applicationId,
      status: seed.status,
      canAccept: false,
      canDecline: false,
    });
  });

  test("termsRequired is true when the opportunity has a review policy", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t);

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.termsRequired).toBe(true);
  });

  test.each(["", "   \n "])(
    "termsRequired is false for a blank review policy (%j)",
    async (reviewPolicy) => {
      const t = convexTest(schema, modules);
      const { creatorId, applicationId } = await seedDetail(t, { opportunity: { reviewPolicy } });

      const detail = await detailOf(t, creatorId, applicationId);

      expect(detail.termsRequired).toBe(false);
    },
  );

  test("termsRequired is reported for non-offered statuses too", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      status: "accepted",
      offerAcceptedAt: Date.now() - 1000,
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.termsRequired).toBe(true);
  });

  test("an accepted offer carries when it was accepted", async () => {
    const t = convexTest(schema, modules);
    const offerAcceptedAt = Date.now() - 1000;
    const { creatorId, applicationId } = await seedDetail(t, {
      status: "accepted",
      offerAcceptedAt,
    });

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.offerAcceptedAt).toBe(offerAcceptedAt);
  });

  test("an offer past its expiry that the cron has not marked yet still reports canAccept, and accepting refuses it", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, applicationId } = await seedDetail(t, {
      offerExpiresAt: Date.now() - 1,
    });

    const detail = await detailOf(t, creatorId, applicationId);

    // The flags exclude the clock on purpose: the client compares offerExpiresAt to its own now.
    expect(detail).toMatchObject({
      status: "offered",
      canAccept: true,
      canDecline: true,
    });
    await expectApiError(
      () => t.run((ctx) => acceptApplication(ctx, creatorId, applicationId)),
      "invalid_state",
      "offer_expired",
    );
  });

  test("a deleted company shows an empty company name", async () => {
    const t = convexTest(schema, modules);
    const { companyId, creatorId, applicationId } = await seedDetail(t);
    await t.run((ctx) => ctx.db.delete("companies", companyId));

    const detail = await detailOf(t, creatorId, applicationId);

    expect(detail.opportunity.companyName).toBe("");
  });
});
