/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedOperator,
  seedPayout,
  seedSubmission,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const firstPage = { numItems: 10, cursor: null };

describe("payouts.approve", () => {
  test("lets a company admin approve its payout and returns the public view", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId);
    const before = await t.run((ctx) => ctx.db.get("payouts", payoutId));
    const startedAt = Date.now();

    const approved = await fixture.asCompany.mutation(api.payouts.approve, { payoutId });

    expect(approved).toMatchObject({
      _id: payoutId,
      approvalStatus: "approved",
      approvalSource: "company",
      paymentStatus: "notStarted",
      reviewRequestedAt: before!.reviewRequestedAt,
      approvalDueAt: before!.approvalDueAt,
    });
    expect(approved.approvedAt).toBeGreaterThanOrEqual(startedAt);
    expect(approved.approvedAt).toBeLessThanOrEqual(Date.now());
    expect(approved).not.toHaveProperty("sourceKey");
    expect(approved).not.toHaveProperty("approvedBy");
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toMatchObject({
      approvedBy: fixture.membership.userId,
      approvedAt: approved.approvedAt,
    });
    expect(await fixture.asCompany.query(api.payouts.get, { payoutId })).toEqual(approved);
    expect(await fixture.asCompany.mutation(api.payouts.approve, { payoutId })).toEqual(approved);
  });

  test.each([
    "signed-out",
    "unsynced",
    "creator",
    "member",
    "operator",
    "wrong-org",
    "inactive",
  ] as const)("refuses approval by a %s caller", async (role) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, role === "member" ? "member" : "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId);
    const before = await t.run((ctx) => ctx.db.get("payouts", payoutId));
    let caller: Pick<TestConvex, "mutation"> = fixture.asCompany;
    if (role === "signed-out") caller = t;
    else if (role === "unsynced") caller = t.withIdentity(workosIdentity({ subject: "unsynced" }));
    else if (role === "creator") caller = fixture.asCreator;
    else if (role === "operator") caller = await seedOperator(t, "operator");
    else if (role === "wrong-org") caller = await seedWrongOrgCaller(t);
    else if (role === "inactive") {
      await t.run((ctx) => ctx.db.patch("users", fixture.membership.userId, { isActive: false }));
    }
    const expectedCode =
      role === "signed-out"
        ? "not_authenticated"
        : role === "unsynced"
          ? "not_synced"
          : role === "inactive"
            ? "account_deactivated"
            : "forbidden";
    await expectApiError(() => caller.mutation(api.payouts.approve, { payoutId }), expectedCode);
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toEqual(before);
  });

  test("hides a foreign company's payout with the same error as a missing payout", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId);
    const outsider = await seedUser(t, {
      subject: "foreign-admin",
      org: { id: "org_outside", role: "admin" },
    });
    await expectApiError(() => outsider.mutation(api.payouts.approve, { payoutId }), "not_found");
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toHaveProperty(
      "approvalStatus",
      "pending",
    );
    await t.run((ctx) => ctx.db.delete("payouts", payoutId));
    await expectApiError(
      () => fixture.asCompany.mutation(api.payouts.approve, { payoutId }),
      "not_found",
    );
  });

  test("rejects a caller-supplied approval actor", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId);
    const args = { payoutId, approvedBy: fixture.creatorUserId };
    await expect(fixture.asCompany.mutation(api.payouts.approve, args)).rejects.toThrow(
      "Unexpected field `approvedBy`",
    );
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toHaveProperty(
      "approvalStatus",
      "pending",
    );
  });

  test("holds approval until every dispute is resolved and preserves the overdue deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.parse("2026-11-01T12:17:23Z");
    vi.setSystemTime(now);
    try {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, {}, "admin");
      const payoutId = await seedPayout(t, fixture.assignmentId, {
        reviewRequestedAt: now - 259_200_000,
        approvalDueAt: now,
      });
      const firstDisputeId = await fixture.asCreator.mutation(api.disputes.create, {
        assignmentId: fixture.assignmentId,
        reason: "payoutAmount",
        description: "The calculated amount is incorrect.",
      });
      const secondDisputeId = await fixture.asCreator.mutation(api.disputes.create, {
        assignmentId: fixture.assignmentId,
        reason: "paymentNotReceived",
        description: "The previous payment has not arrived.",
      });
      await expectApiError(
        () => fixture.asCompany.mutation(api.payouts.approve, { payoutId }),
        "invalid_state",
        "payout_disputed",
      );
      await t.mutation(internal.payouts.autoApprove, {});
      await fixture.asCreator.mutation(api.disputes.resolve, {
        disputeId: firstDisputeId,
        outcome: "withdrawn",
      });
      await t.mutation(internal.payouts.autoApprove, {});
      expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toMatchObject({
        approvalStatus: "pending",
        approvalDueAt: now,
      });
      vi.setSystemTime(now + 86_400_000);
      await fixture.asCreator.mutation(api.disputes.resolve, {
        disputeId: secondDisputeId,
        outcome: "withdrawn",
      });
      await t.mutation(internal.payouts.autoApprove, {});
      const stored = await t.run((ctx) => ctx.db.get("payouts", payoutId));
      expect(stored).toMatchObject({
        approvalStatus: "approved",
        approvalSource: "automatic",
        approvedAt: now + 86_400_000,
        approvalDueAt: now,
        reviewRequestedAt: now - 259_200_000,
        paymentStatus: "notStarted",
      });
      expect(stored).not.toHaveProperty("approvedBy");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("internal payouts.autoApprove", () => {
  test("is internal and an empty sweep schedules no continuation", async () => {
    const { autoApprove } = await import("../payouts");
    expect(autoApprove).toHaveProperty("isInternal", true);
    expect(autoApprove).not.toHaveProperty("isPublic");
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.payouts.autoApprove, {})).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
  });

  test("approves at the deadline, preserves manual approval, and safely repeats", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.parse("2026-11-01T12:17:23Z");
    vi.setSystemTime(now);
    try {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, {}, "admin");
      const dueId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: now });
      const futureId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: now + 1 });
      const manualId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: now });
      await fixture.asCompany.mutation(api.payouts.approve, { payoutId: manualId });
      const manual = await t.run((ctx) => ctx.db.get("payouts", manualId));

      await t.mutation(internal.payouts.autoApprove, {});
      const due = await t.run((ctx) => ctx.db.get("payouts", dueId));
      expect(due).toMatchObject({
        approvalStatus: "approved",
        approvalSource: "automatic",
        approvedAt: now,
        paymentStatus: "notStarted",
      });
      expect(due).not.toHaveProperty("approvedBy");
      expect(await t.run((ctx) => ctx.db.get("payouts", futureId))).toHaveProperty(
        "approvalStatus",
        "pending",
      );
      expect(await t.run((ctx) => ctx.db.get("payouts", manualId))).toEqual(manual);
      await t.mutation(internal.payouts.autoApprove, {});
      expect(await t.run((ctx) => ctx.db.get("payouts", dueId))).toEqual(due);
      expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("continues after an approved page leaves the pending index without skipping tied deadlines", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-11-01T12:17:23Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    try {
      const fixture = await seedAssignmentFixture(t);
      const payoutIds: Id<"payouts">[] = [];
      for (let i = 0; i < 51; i++) {
        payoutIds.push(await seedPayout(t, fixture.assignmentId, { approvalDueAt: now }));
      }
      await t.mutation(internal.payouts.autoApprove, {});
      const firstPage = await t.run(
        async (ctx) => await Promise.all(payoutIds.map((id) => ctx.db.get("payouts", id))),
      );
      expect(firstPage.filter((payout) => payout?.approvalStatus === "approved")).toHaveLength(50);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      const completed = await t.run(
        async (ctx) => await Promise.all(payoutIds.map((id) => ctx.db.get("payouts", id))),
      );
      expect(completed.every((payout) => payout?.approvalStatus === "approved")).toBe(true);
      const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
      expect(jobs).toHaveLength(1);
      expect(jobs[0].state.kind).toBe("success");
    } finally {
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      vi.useRealTimers();
    }
  });

  test("advances through held pages to later eligible payouts and stops scheduling", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-11-01T12:17:23Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    try {
      const fixture = await seedAssignmentFixture(t);
      await seedDispute(t, fixture);
      const heldIds: Id<"payouts">[] = [];
      for (let i = 0; i < 51; i++) {
        heldIds.push(await seedPayout(t, fixture.assignmentId, { approvalDueAt: now - 1000 }));
      }
      const assignment = await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId));
      const otherAssignmentId = await seedAssignment(t, {
        opportunityId: assignment!.opportunityId,
        creatorId: await seedCreatorId(t, "other-earner"),
      });
      const eligibleId = await seedPayout(t, otherAssignmentId, { approvalDueAt: now });
      const futureId = await seedPayout(t, otherAssignmentId, { approvalDueAt: now + 1000 });
      await t.mutation(internal.payouts.autoApprove, {});
      expect(await t.run((ctx) => ctx.db.get("payouts", eligibleId))).toHaveProperty(
        "approvalStatus",
        "pending",
      );
      const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
      expect(jobs).toHaveLength(1);
      expect(jobs[0].args).toEqual([{ continuation: { cutoff: now, cursor: expect.any(String) } }]);

      // Even if a continuation runs late, its original cutoff defines this sweep.
      vi.setSystemTime(now + 2000);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await t.run((ctx) => ctx.db.get("payouts", eligibleId))).toMatchObject({
        approvalStatus: "approved",
        approvalSource: "automatic",
      });
      expect(await t.run((ctx) => ctx.db.get("payouts", futureId))).toHaveProperty(
        "approvalStatus",
        "pending",
      );
      const held = await t.run((ctx) =>
        Promise.all(heldIds.map((id) => ctx.db.get("payouts", id))),
      );
      expect(held.every((payout) => payout?.approvalStatus === "pending")).toBe(true);
      const completed = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
      expect(completed).toHaveLength(1);
      expect(completed.every((job) => job.state.kind === "success")).toBe(true);

      // The next cron sweep can pick up deadlines that passed during the first.
      await t.mutation(internal.payouts.autoApprove, {});
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await t.run((ctx) => ctx.db.get("payouts", futureId))).toHaveProperty(
        "approvalStatus",
        "approved",
      );
    } finally {
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      vi.useRealTimers();
    }
  });
});

describe("internal payouts.create", () => {
  test("is registered as an internal mutation", async () => {
    // convex-test can invoke internal functions, so calling it as a test user
    // would not prove the function is unavailable to public clients.
    const { create } = await import("../payouts");
    expect(create).toHaveProperty("isInternal", true);
    expect(create).not.toHaveProperty("isPublic");
  });

  test("records finalized earnings and starts the three-day company review window", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const before = Date.now();

    const payout = await t.mutation(internal.payouts.create, {
      assignmentId: fixture.assignmentId,
      sourceKey: "fixed-fee:published",
      amountCents: 12_345,
      currency: "usd",
    });

    expect(payout).toMatchObject({
      assignmentId: fixture.assignmentId,
      creatorId: fixture.creatorId,
      companyId: fixture.membership.companyId,
      sourceKey: "fixed-fee:published",
      amountCents: 12_345,
      currency: "usd",
      approvalStatus: "pending",
      paymentStatus: "notStarted",
    });
    expect(payout.reviewRequestedAt).toBeGreaterThanOrEqual(before);
    expect(payout.reviewRequestedAt).toBeLessThanOrEqual(Date.now());
    expect(payout.approvalDueAt - payout.reviewRequestedAt).toBe(72 * 60 * 60 * 1000);
    expect(await t.run((ctx) => ctx.db.get("payouts", payout._id))).toEqual(payout);
  });

  test("returns optional earning context and exposes the payout only through authorized reads", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "approved");
    const { postId, campaignId } = await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (assignment === null) throw new Error("expected seeded assignment");
      const postId = await ctx.db.insert("posts", {
        submissionId,
        campaignId: assignment.campaignId,
        url: "https://x.com/creator/status/1234",
        xPostId: "1234",
        isActive: true,
        isVerified: true,
      });
      return { postId, campaignId: assignment.campaignId };
    });
    const earningPeriod = { startsAt: Date.now() - 86_400_000, endsAt: Date.now() - 1000 };
    const payout = await t.mutation(internal.payouts.create, {
      assignmentId: fixture.assignmentId,
      sourceKey: "views:period-1",
      amountCents: 2500,
      currency: "usd",
      postId,
      earningPeriod,
    });
    expect(payout).toMatchObject({ postId, campaignId, earningPeriod });

    const operator = await seedOperator(t, "operator");
    for (const caller of [fixture.asCreator, fixture.asCompany, operator]) {
      const visible = await caller.query(api.payouts.get, { payoutId: payout._id });
      expect(visible).toMatchObject({
        _id: payout._id,
        postId,
        earningPeriod,
        approvalDueAt: payout.approvalDueAt,
        approvalStatus: "pending",
      });
      expect(visible).not.toHaveProperty("sourceKey");
      const listed = await caller.query(api.payouts.list, {
        paginationOpts: firstPage,
        assignmentId: fixture.assignmentId,
        approvalStatus: "pending",
      });
      expect(listed.page).toEqual([visible]);
    }

    const outsiders = [
      await seedUser(t, { subject: "outside-creator" }),
      await seedUser(t, { subject: "outside-company", org: { id: "org_outside" } }),
    ];
    for (const caller of outsiders) {
      await expectApiError(
        () => caller.query(api.payouts.get, { payoutId: payout._id }),
        "not_found",
      );
      const listed = await caller.query(api.payouts.list, {
        paginationOpts: firstPage,
        assignmentId: fixture.assignmentId,
      });
      expect(listed.page).toEqual([]);
    }
  });

  test.each([
    "creatorId",
    "companyId",
    "campaignId",
    "reviewRequestedAt",
    "approvalDueAt",
    "approvalStatus",
    "paymentStatus",
    "approvedBy",
  ] as const)(
    "rejects a supplied %s instead of allowing creation to override it",
    async (field) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);
      const assignment = await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId));
      if (assignment === null) throw new Error("expected seeded assignment");
      const forbiddenFields = {
        creatorId: fixture.creatorId,
        companyId: fixture.membership.companyId,
        campaignId: assignment.campaignId,
        reviewRequestedAt: 1000,
        approvalDueAt: 2000,
        approvalStatus: "approved",
        paymentStatus: "transferred",
        approvedBy: fixture.membership.userId,
      };
      const args = {
        assignmentId: fixture.assignmentId,
        sourceKey: "fixed-fee:published",
        amountCents: 12_345,
        currency: "usd",
        [field]: forbiddenFields[field],
      };

      await expect(t.mutation(internal.payouts.create, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
      expect(
        await t.run((ctx) =>
          ctx.db
            .query("payouts")
            .withIndex("by_assignmentId_and_sourceKey", (q) =>
              q.eq("assignmentId", fixture.assignmentId).eq("sourceKey", args.sourceKey),
            )
            .unique(),
        ),
      ).toBeNull();
    },
  );
});

async function seedPayment(t: TestConvex, role: "admin" | "member" = "member") {
  const fixture = await seedAssignmentFixture(t, {}, role);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    sourceKey: "internal-earnings-event",
    amountCents: 12_345,
    currency: "usd",
    reviewRequestedAt: 1_800_000_000_000,
    approvalDueAt: 1_800_259_200_000,
    approvalStatus: "approved",
    approvedAt: 1_800_086_400_000,
    approvalSource: "company",
    approvedBy: fixture.membership.userId,
    paymentStatus: "queued",
  });
  return { ...fixture, payoutId };
}

describe("payouts.get", () => {
  test.each(["creator", "member", "admin", "operator"] as const)(
    "allows an authorized %s to read the public payout view",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t, role === "admin" ? "admin" : "member");
      const caller =
        role === "operator"
          ? await seedOperator(t, "operator")
          : role === "creator"
            ? fixture.asCreator
            : fixture.asCompany;

      const result = await caller.query(api.payouts.get, { payoutId: fixture.payoutId });

      expect(result).toMatchObject({
        _id: fixture.payoutId,
        assignmentId: fixture.assignmentId,
        creatorId: fixture.creatorId,
        companyId: fixture.membership.companyId,
        amountCents: 12_345,
        currency: "usd",
        reviewRequestedAt: 1_800_000_000_000,
        approvalDueAt: 1_800_259_200_000,
        approvalStatus: "approved",
        approvedAt: 1_800_086_400_000,
        approvalSource: "company",
        paymentStatus: "queued",
      });
      expect(result).not.toHaveProperty("sourceKey");
      expect(result).not.toHaveProperty("approvedBy");
    },
  );

  test.each(["creator", "company"] as const)(
    "hides another %s's payout with the same error as a missing payout",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const outsider = await seedUser(t, {
        subject: "outsider",
        ...(role === "company" ? { org: { id: "org_outside" } } : {}),
      });

      await expectApiError(
        () => outsider.query(api.payouts.get, { payoutId: fixture.payoutId }),
        "not_found",
      );
      await t.run(async (ctx) => await ctx.db.delete("payouts", fixture.payoutId));
      await expectApiError(
        () => fixture.asCreator.query(api.payouts.get, { payoutId: fixture.payoutId }),
        "not_found",
      );
    },
  );
});

describe.each(["get", "list"] as const)("payouts.%s authorization", (route) => {
  async function read(
    caller: Pick<TestConvex, "query">,
    fixture: Awaited<ReturnType<typeof seedPayment>>,
  ) {
    return route === "get"
      ? await caller.query(api.payouts.get, { payoutId: fixture.payoutId })
      : await caller.query(api.payouts.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        });
  }

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await expectApiError(() => read(t, fixture), "not_authenticated");
  });

  test("rejects an unsynced account", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    const caller = t.withIdentity(workosIdentity({ subject: "unsynced" }));
    await expectApiError(() => read(caller, fixture), "not_synced");
  });

  test("rejects a forged company organization", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    const caller = await seedWrongOrgCaller(t);
    await expectApiError(() => read(caller, fixture), "forbidden");
  });

  test.each(["creator", "company"] as const)("rejects an inactive %s", async (role) => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(
        "users",
        role === "creator" ? fixture.creatorUserId : fixture.membership.userId,
        { isActive: false },
      );
    });
    await expectApiError(
      () => read(role === "creator" ? fixture.asCreator : fixture.asCompany, fixture),
      "account_deactivated",
    );
  });
});

describe("payouts.list", () => {
  test.each(["creator", "member", "admin", "operator"] as const)(
    "returns public payout views to an authorized %s",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t, role === "admin" ? "admin" : "member");
      const caller =
        role === "operator"
          ? await seedOperator(t, "operator")
          : role === "creator"
            ? fixture.asCreator
            : fixture.asCompany;

      const result = await caller.query(api.payouts.list, { paginationOpts: firstPage });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toMatchObject({ _id: fixture.payoutId, amountCents: 12_345 });
      expect(result.page[0]).not.toHaveProperty("sourceKey");
      expect(result.page[0]).not.toHaveProperty("approvedBy");
      expect(result.isDone).toBe(true);
    },
  );

  test.each(["creator", "company"] as const)(
    "does not let a %s use scope filters to see someone else's payout",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const outsider = await seedUser(t, {
        subject: "outsider",
        ...(role === "company" ? { org: { id: "org_outside" } } : {}),
      });
      const payout = await t.run(async (ctx) => await ctx.db.get("payouts", fixture.payoutId));
      if (payout === null) throw new Error("expected seeded payout");

      for (const filters of [
        {},
        { assignmentId: fixture.assignmentId },
        { campaignId: payout.campaignId },
        { assignmentId: fixture.assignmentId, campaignId: payout.campaignId },
      ]) {
        const result = await outsider.query(api.payouts.list, {
          ...filters,
          approvalStatus: "approved",
          paginationOpts: firstPage,
        });
        expect(result.page).toEqual([]);
        expect(result.isDone).toBe(true);
      }
    },
  );

  test.each(["creatorId", "companyId"] as const)(
    "does not accept a caller-supplied %s to override ownership",
    async (field) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const args = {
        paginationOpts: firstPage,
        [field]: field === "creatorId" ? fixture.creatorId : fixture.membership.companyId,
      };
      await expect(fixture.asCreator.query(api.payouts.list, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
    },
  );

  test("validates the approval status filter", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await expect(
      fixture.asCreator.query(api.payouts.list, {
        paginationOpts: firstPage,
        // @ts-expect-error Prove runtime validation rejects arbitrary client strings.
        approvalStatus: "paid",
      }),
    ).rejects.toThrow("Validator error:");
  });
});
